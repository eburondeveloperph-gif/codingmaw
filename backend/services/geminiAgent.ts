import { GoogleGenAI } from '@google/genai';

// Initialize Gemini with API key from environment
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface GeminiAgentRequest {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
}

export interface GeminiAgentResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  simulationSteps?: SimulationStep[];
}

export interface SimulationStep {
  step: number;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  timestamp: string;
}

// Live agentic workflow with Gemini
export async function runAgenticWorkflow(
  request: GeminiAgentRequest,
  onStep?: (step: SimulationStep) => void
): Promise<GeminiAgentResponse> {
  const model = request.model || 'gemini-2.0-flash-exp';
  const simulationSteps: SimulationStep[] = [];

  const addStep = (action: string, status: SimulationStep['status'], output?: string) => {
    const step: SimulationStep = {
      step: simulationSteps.length + 1,
      action,
      status,
      output,
      timestamp: new Date().toISOString(),
    };
    simulationSteps.push(step);
    onStep?.(step);
    return step;
  };

  try {
    addStep('Initializing Gemini agent...', 'running');

    const response = await genAI.models.generateContent({
      model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 8192,
      },
    });

    const text = response.text || '';
    
    addStep('Agent response received', 'completed', text.slice(0, 200));

    // Parse agentic workflow steps from response
    const steps = parseAgenticSteps(text);
    steps.forEach((s, i) => {
      addStep(s.action, s.status, s.output);
    });

    return {
      text,
      simulationSteps,
    };
  } catch (error: any) {
    addStep(`Error: ${error.message}`, 'failed');
    throw error;
  }
}

// Parse agentic workflow steps from Gemini response
function parseAgenticSteps(text: string): Array<{action: string; status: SimulationStep['status']; output?: string}> {
  const steps: Array<{action: string; status: SimulationStep['status']; output?: string}> = [];
  
  // Look for patterns like "Step 1: ...", "🔍 Searching...", "✅ Completed"
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match step patterns
    if (trimmed.match(/^Step \d+:/i)) {
      steps.push({
        action: trimmed,
        status: 'running',
      });
    }
    // Match emoji status patterns
    else if (trimmed.match(/^[🔍✅❌⚠️🔄💡📝🌐]/)) {
      const status = trimmed.includes('✅') ? 'completed' : 
                    trimmed.includes('❌') ? 'failed' :
                    trimmed.includes('🔄') ? 'running' : 'pending';
      steps.push({
        action: trimmed.replace(/^[🔍✅❌⚠️🔄💡📝🌐]\s*/, ''),
        status,
        output: trimmed,
      });
    }
    // Match markdown task lists
    else if (trimmed.match(/^- \[([ x])\]/)) {
      const checked = trimmed.match(/^- \[x\]/);
      steps.push({
        action: trimmed.replace(/^- \[[ x]\]\s*/, ''),
        status: checked ? 'completed' : 'pending',
      });
    }
  }
  
  return steps;
}

// Streaming agentic workflow
export async function* streamAgenticWorkflow(
  request: GeminiAgentRequest
): AsyncGenerator<{
  type: 'step' | 'content' | 'done' | 'error';
  data?: SimulationStep | string | { error: string };
}> {
  const model = request.model || 'gemini-2.0-flash-exp';

  try {
    yield { type: 'step', data: { step: 1, action: 'Initializing agent session...', status: 'running', timestamp: new Date().toISOString() } };

    const response = await genAI.models.generateContentStream({
      model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 8192,
      },
    });

    yield { type: 'step', data: { step: 2, action: 'Processing with Gemini...', status: 'running', timestamp: new Date().toISOString() } };

    let fullText = '';
    for await (const chunk of response) {
      const text = chunk.text || '';
      fullText += text;
      yield { type: 'content', data: text };
    }

    yield { type: 'step', data: { step: 3, action: 'Response complete', status: 'completed', output: fullText.slice(0, 100), timestamp: new Date().toISOString() } };
    yield { type: 'done' };
  } catch (error: any) {
    yield { type: 'error', data: { error: error.message } };
  }
}

// Multi-step autonomous agent
export async function runAutonomousAgent(
  task: string,
  maxSteps: number = 10,
  onStep?: (step: number, action: string, result: string) => void
): Promise<{ result: string; steps: SimulationStep[] }> {
  const steps: SimulationStep[] = [];
  let currentStep = 0;
  let context = '';

  const systemPrompt = `You are an autonomous AI agent. You can:
1. Plan tasks step by step
2. Execute actions
3. Analyze results
4. Adapt based on feedback

Format your response as:
Step {N}: [ACTION] - Description
Result: What happened
Next: What to do next

Be concise and actionable.`;

  while (currentStep < maxSteps) {
    currentStep++;
    
    const prompt = `Task: ${task}
${context ? `\nPrevious context:\n${context}` : ''}
\nCurrent step: ${currentStep}/${maxSteps}
What should I do now?`;

    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });

      const text = response.text || '';
      
      // Parse step and result
      const stepMatch = text.match(/Step \d+:\s*(.+)/i);
      const resultMatch = text.match(/Result:\s*(.+)/i);
      
      const action = stepMatch?.[1] || text.slice(0, 100);
      const result = resultMatch?.[1] || text;

      const step: SimulationStep = {
        step: currentStep,
        action,
        status: 'completed',
        output: result,
        timestamp: new Date().toISOString(),
      };
      
      steps.push(step);
      onStep?.(currentStep, action, result);

      context += `\nStep ${currentStep}: ${action}\nResult: ${result}`;

      // Check if task is complete
      if (text.toLowerCase().includes('task complete') || 
          text.toLowerCase().includes('finished') ||
          text.toLowerCase().includes('done')) {
        break;
      }
    } catch (error: any) {
      steps.push({
        step: currentStep,
        action: `Error: ${error.message}`,
        status: 'failed',
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }

  // Final summary
  const finalPrompt = `Task: ${task}\n\nExecution history:\n${context}\n\nProvide a final summary of what was accomplished.`;
  
  try {
    const finalResponse = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: finalPrompt,
      config: { temperature: 0.5 },
    });

    return {
      result: finalResponse.text || '',
      steps,
    };
  } catch {
    return {
      result: context,
      steps,
    };
  }
}
