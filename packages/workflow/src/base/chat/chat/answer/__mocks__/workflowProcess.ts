import type { WorkflowProcess } from '@/base/chat/types'
import { WorkflowRunningStatus } from '@/types'

export const mockedWorkflowProcess = {
  status: WorkflowRunningStatus.Succeeded,
  resultText: 'Hello, how can I assist you today?',
  tracing: [
    {
      extras: {},
      id: 'f6337dc9-e280-4915-965f-10b0552dd917',
      node_id: '1724232060789',
      node_type: 'start',
      title: 'Start',
      index: 1,
      predecessor_node_id: null,
      inputs: {
        'sys.query': 'hi',
        'sys.files': [],
        'sys.conversation_id': '92ce0a3e-8f15-43d1-b31d-32716c4b10a7',
        'sys.user_id': 'fbff43f9-d5a4-4e85-b63b-d3a91d806c6f',
        'sys.dialogue_count': 1,
        'sys.app_id': 'b2e8906a-aad3-43a0-9ace-0e44cc7315e1',
        'sys.workflow_id': '70004abe-561f-418b-b9e8-8c957ce55140',
        'sys.workflow_run_id': '69db9267-aaee-42e1-9581-dbfb67e8eeb5',
      },
      process_data: null,
      outputs: {
        'sys.query': 'hi',
        'sys.files': [],
        'sys.conversation_id': '92ce0a3e-8f15-43d1-b31d-32716c4b10a7',
        'sys.user_id': 'fbff43f9-d5a4-4e85-b63b-d3a91d806c6f',
        'sys.dialogue_count': 1,
        'sys.app_id': 'b2e8906a-aad3-43a0-9ace-0e44cc7315e1',
        'sys.workflow_id': '70004abe-561f-418b-b9e8-8c957ce55140',
        'sys.workflow_run_id': '69db9267-aaee-42e1-9581-dbfb67e8eeb5',
      },
      status: 'succeeded',
      error: null,
      elapsed_time: 0.035744,
      execution_metadata: null,
      created_at: 1728980002,
      finished_at: 1728980002,
      files: [],
      parallel_id: null,
      parallel_start_node_id: null,
      parent_parallel_id: null,
      parent_parallel_start_node_id: null,
      iteration_id: null,
    },
    {
      extras: {},
      id: '92204d8d-4198-4c46-aa02-c2754b11dec9',
      node_id: 'llm',
      node_type: 'llm',
      title: 'LLM',
      index: 2,
      predecessor_node_id: '1724232060789',
      inputs: null,
      process_data: {
        model_mode: 'chat',
        prompts: [
          {
            role: 'system',
            text: 'hi',
            files: [],
          },
          {
            role: 'user',
            text: 'hi',
            files: [],
          },
        ],
        model_provider: 'openai',
        model_name: 'gpt-4o-mini',
      },
      outputs: {
        text: 'Hello! How can I assist you today?',
        usage: {
          prompt_tokens: 13,
          prompt_unit_price: '0.15',
          prompt_price_unit: '0.000001',
          prompt_price: '0.0000020',
          completion_tokens: 9,
          completion_unit_price: '0.60',
          completion_price_unit: '0.000001',
          completion_price: '0.0000054',
          total_tokens: 22,
          total_price: '0.0000074',
          currency: 'USD',
          latency: 1.8902503330027685,
        },
        finish_reason: 'stop',
      },
      status: 'succeeded',
      error: null,
      elapsed_time: 5.089409,
      execution_metadata: {
        total_tokens: 22,
        total_price: '0.0000074',
        currency: 'USD',
      },
      created_at: 1728980002,
      finished_at: 1728980007,
      files: [],
      parallel_id: null,
      parallel_start_node_id: null,
      parent_parallel_id: null,
      parent_parallel_start_node_id: null,
      iteration_id: null,
    },
    {
      extras: {},
      id: '7149bac6-60f9-4e06-a5ed-1d9d3764c06b',
      node_id: 'answer',
      node_type: 'answer',
      title: 'Answer',
      index: 3,
      predecessor_node_id: 'llm',
      inputs: null,
      process_data: null,
      outputs: {
        answer: 'Hello! How can I assist you today?',
      },
      status: 'succeeded',
      error: null,
      elapsed_time: 0.015339,
      execution_metadata: null,
      created_at: 1728980007,
      finished_at: 1728980007,
      parallel_id: null,
      parallel_start_node_id: null,
      parent_parallel_id: null,
      parent_parallel_start_node_id: null,
    },
  ],
} as unknown as WorkflowProcess
