/**
 * Mahana MCP Server for ElevenLabs Voice Agent
 *
 * Provides cloud tools (Supabase, memory, etc.) to ElevenLabs agents.
 * Endpoint: https://mahana-mcp-server.vercel.app/api/mcp
 */

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(url, key)
}

// Create MCP handler with tools
const handler = createMcpHandler(
  (server) => {
    // =========================================================================
    // Utility Tools
    // =========================================================================

    server.tool(
      'get_current_time',
      'Get the current date and time in ISO format',
      {},
      async () => {
        const now = new Date()
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              iso: now.toISOString(),
              unix: Math.floor(now.getTime() / 1000),
              formatted: now.toLocaleString('en-US', {
                timeZone: 'Europe/Oslo',
                dateStyle: 'full',
                timeStyle: 'long'
              })
            })
          }]
        }
      }
    )

    // =========================================================================
    // Supabase Tools
    // =========================================================================

    server.tool(
      'supabase_query',
      'Query data from a Supabase table. Returns matching rows.',
      {
        table: z.string().describe('The table name to query'),
        select: z.string().optional().describe('Columns to select (default: *)'),
        filter: z.object({
          column: z.string(),
          operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']),
          value: z.union([z.string(), z.number(), z.boolean()])
        }).optional().describe('Optional filter condition'),
        limit: z.number().optional().describe('Maximum rows to return (default: 100)')
      },
      async ({ table, select = '*', filter, limit = 100 }) => {
        try {
          const supabase = getSupabase()
          let query = supabase.from(table).select(select).limit(limit)

          if (filter) {
            query = query.filter(filter.column, filter.operator, filter.value)
          }

          const { data, error } = await query

          if (error) {
            return {
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, count: data?.length || 0, data })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'supabase_insert',
      'Insert a new record into a Supabase table.',
      {
        table: z.string().describe('The table name'),
        data: z.record(z.any()).describe('The record data as key-value pairs')
      },
      async ({ table, data }) => {
        try {
          const supabase = getSupabase()
          const { data: result, error } = await supabase
            .from(table)
            .insert(data)
            .select()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, inserted: result })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'supabase_update',
      'Update records in a Supabase table.',
      {
        table: z.string().describe('The table name'),
        data: z.record(z.any()).describe('The fields to update'),
        filter: z.object({
          column: z.string(),
          operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
          value: z.union([z.string(), z.number(), z.boolean()])
        }).describe('Filter to identify which records to update')
      },
      async ({ table, data, filter }) => {
        try {
          const supabase = getSupabase()
          const { data: result, error } = await supabase
            .from(table)
            .update(data)
            .filter(filter.column, filter.operator, filter.value)
            .select()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, updated: result?.length || 0, data: result })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'supabase_delete',
      'Delete records from a Supabase table.',
      {
        table: z.string().describe('The table name'),
        filter: z.object({
          column: z.string(),
          operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
          value: z.union([z.string(), z.number(), z.boolean()])
        }).describe('Filter to identify which records to delete')
      },
      async ({ table, filter }) => {
        try {
          const supabase = getSupabase()
          const { data: result, error } = await supabase
            .from(table)
            .delete()
            .filter(filter.column, filter.operator, filter.value)
            .select()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, deleted: result?.length || 0 })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    // =========================================================================
    // Voice-Terminal Bridge Tools
    // =========================================================================

    server.tool(
      'run_terminal_command',
      'Execute a command in the user\'s terminal. Use this when the user asks to run shell commands, scripts, or interact with the terminal. The command will be queued and executed by the terminal bridge worker.',
      {
        command: z.string().describe('The terminal command to execute (e.g., "ls -la", "npm install", "git status")'),
        intent: z.string().optional().describe('Brief description of what the command does')
      },
      async ({ command, intent }) => {
        try {
          const supabase = getSupabase()

          const { data, error } = await supabase
            .from('voice_messages_tasks')
            .insert({
              command_text: command.trim(),
              intent: intent || null,
              status: 'pending',
              created_at: new Date().toISOString()
            })
            .select('id, command_text, status, created_at')
            .single()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error queueing command: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                task_id: data.id,
                command: data.command_text,
                status: data.status,
                message: 'Command queued for terminal execution. The terminal will run it shortly.'
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'check_command_status',
      'Check the status and result of a previously submitted terminal command.',
      {
        task_id: z.number().describe('The task ID returned from run_terminal_command')
      },
      async ({ task_id }) => {
        try {
          const supabase = getSupabase()

          const { data, error } = await supabase
            .from('voice_messages_tasks')
            .select('id, command_text, intent, status, response_data, created_at, processed_at, completed_at')
            .eq('id', task_id)
            .single()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error checking status: ${error.message}` }],
              isError: true
            }
          }

          if (!data) {
            return {
              content: [{ type: 'text', text: `Task ${task_id} not found` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                task: {
                  id: data.id,
                  command: data.command_text,
                  intent: data.intent,
                  status: data.status,
                  result: data.response_data,
                  created_at: data.created_at,
                  completed_at: data.completed_at
                }
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_pending_commands',
      'Get a list of pending terminal commands that haven\'t been executed yet.',
      {
        limit: z.number().optional().describe('Maximum number of commands to return (default: 10)')
      },
      async ({ limit = 10 }) => {
        try {
          const supabase = getSupabase()

          const { data, error } = await supabase
            .from('voice_messages_tasks')
            .select('id, command_text, intent, status, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit)

          if (error) {
            return {
              content: [{ type: 'text', text: `Error fetching pending commands: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: data?.length || 0,
                pending_commands: data
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_recent_commands',
      'Get recently executed terminal commands and their results.',
      {
        limit: z.number().optional().describe('Maximum number of commands to return (default: 5)'),
        status: z.enum(['completed', 'failed', 'all']).optional().describe('Filter by status (default: all)')
      },
      async ({ limit = 5, status = 'all' }) => {
        try {
          const supabase = getSupabase()

          let query = supabase
            .from('voice_messages_tasks')
            .select('id, command_text, intent, status, response_data, created_at, completed_at')
            .order('created_at', { ascending: false })
            .limit(limit)

          if (status !== 'all') {
            query = query.eq('status', status)
          }

          const { data, error } = await query

          if (error) {
            return {
              content: [{ type: 'text', text: `Error fetching recent commands: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: data?.length || 0,
                recent_commands: data?.map(cmd => ({
                  id: cmd.id,
                  command: cmd.command_text,
                  status: cmd.status,
                  result: cmd.response_data,
                  created_at: cmd.created_at,
                  completed_at: cmd.completed_at
                }))
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    // =========================================================================
    // Terminal Session Management Tools
    // =========================================================================

    server.tool(
      'create_terminal_session',
      'Create a new terminal session. Use this to spawn a new terminal tab for running Claude Code or other long-running processes.',
      {
        name: z.string().describe('Friendly name for the session (e.g., "Claude Agent 1", "Build Server")'),
        working_directory: z.string().optional().describe('Starting directory for the terminal'),
        agent_type: z.enum(['claude-code', 'shell', 'npm', 'custom']).optional().describe('Type of agent/process to run')
      },
      async ({ name, working_directory, agent_type = 'shell' }) => {
        try {
          const supabase = getSupabase()
          const sessionId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          const { data, error } = await supabase
            .from('terminal_sessions')
            .insert({
              id: sessionId,
              name,
              working_directory: working_directory || '~',
              agent_type,
              status: 'pending',
              created_at: new Date().toISOString()
            })
            .select()
            .single()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error creating session: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id: data.id,
                name: data.name,
                status: 'pending',
                message: 'Terminal session created. i-View will spawn the terminal shortly.'
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'list_terminal_sessions',
      'List all active terminal sessions. Shows Claude Code agents and other terminals.',
      {
        status: z.enum(['active', 'pending', 'closed', 'all']).optional().describe('Filter by session status')
      },
      async ({ status = 'active' }) => {
        try {
          const supabase = getSupabase()

          let query = supabase
            .from('terminal_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20)

          if (status !== 'all') {
            query = query.eq('status', status)
          }

          const { data, error } = await query

          if (error) {
            return {
              content: [{ type: 'text', text: `Error listing sessions: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: data?.length || 0,
                sessions: data?.map(s => ({
                  id: s.id,
                  name: s.name,
                  agent_type: s.agent_type,
                  status: s.status,
                  working_directory: s.working_directory,
                  created_at: s.created_at,
                  last_activity: s.last_activity_at
                }))
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'switch_terminal_session',
      'Switch focus to a different terminal session. Makes that terminal the active one for commands.',
      {
        session_id: z.string().describe('The session ID to switch to')
      },
      async ({ session_id }) => {
        try {
          const supabase = getSupabase()

          // Update the session to mark it as the active focus
          const { data, error } = await supabase
            .from('terminal_sessions')
            .update({
              is_focused: true,
              last_activity_at: new Date().toISOString()
            })
            .eq('id', session_id)
            .select()
            .single()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error switching session: ${error.message}` }],
              isError: true
            }
          }

          // Queue a switch action for i-View to pick up
          await supabase
            .from('voice_messages_tasks')
            .insert({
              command_text: `__SWITCH_SESSION__:${session_id}`,
              intent: 'switch_terminal',
              parameters: { session_id, action: 'switch' },
              status: 'pending',
              created_at: new Date().toISOString()
            })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id,
                name: data?.name,
                message: `Switched to terminal session: ${data?.name || session_id}`
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'close_terminal_session',
      'Close a terminal session. This will terminate any running processes in that terminal.',
      {
        session_id: z.string().describe('The session ID to close')
      },
      async ({ session_id }) => {
        try {
          const supabase = getSupabase()

          const { error } = await supabase
            .from('terminal_sessions')
            .update({
              status: 'closed',
              closed_at: new Date().toISOString()
            })
            .eq('id', session_id)

          if (error) {
            return {
              content: [{ type: 'text', text: `Error closing session: ${error.message}` }],
              isError: true
            }
          }

          // Queue a close action for i-View
          await supabase
            .from('voice_messages_tasks')
            .insert({
              command_text: `__CLOSE_SESSION__:${session_id}`,
              intent: 'close_terminal',
              parameters: { session_id, action: 'close' },
              status: 'pending',
              created_at: new Date().toISOString()
            })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id,
                message: 'Terminal session marked for closure.'
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    // =========================================================================
    // Claude Code Agent Tools
    // =========================================================================

    server.tool(
      'start_claude_agent',
      'Start a new Claude Code agent in a terminal session. This creates a new terminal and launches Claude Code with optional initial prompt.',
      {
        name: z.string().describe('Name for this Claude agent instance (e.g., "Backend Agent", "UI Agent")'),
        working_directory: z.string().optional().describe('Project directory to start in'),
        initial_prompt: z.string().optional().describe('Initial task/prompt to give Claude Code'),
        model: z.enum(['sonnet', 'opus', 'haiku']).optional().describe('Claude model to use (default: sonnet)')
      },
      async ({ name, working_directory, initial_prompt, model = 'sonnet' }) => {
        try {
          const supabase = getSupabase()
          const sessionId = `claude-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create the session record
          const { data: session, error: sessionError } = await supabase
            .from('terminal_sessions')
            .insert({
              id: sessionId,
              name,
              working_directory: working_directory || '~',
              agent_type: 'claude-code',
              status: 'pending',
              metadata: { model, initial_prompt },
              created_at: new Date().toISOString()
            })
            .select()
            .single()

          if (sessionError) {
            return {
              content: [{ type: 'text', text: `Error creating Claude session: ${sessionError.message}` }],
              isError: true
            }
          }

          // Build the claude command
          let claudeCmd = 'claude'
          if (model && model !== 'sonnet') {
            claudeCmd += ` --model ${model}`
          }
          if (initial_prompt) {
            // Escape the prompt for shell
            const escapedPrompt = initial_prompt.replace(/'/g, "'\\''")
            claudeCmd += ` '${escapedPrompt}'`
          }

          // Queue the command to start Claude
          await supabase
            .from('voice_messages_tasks')
            .insert({
              command_text: `__START_CLAUDE__:${sessionId}`,
              intent: 'start_claude_agent',
              parameters: {
                session_id: sessionId,
                action: 'start_claude',
                working_directory,
                claude_command: claudeCmd,
                model,
                initial_prompt
              },
              status: 'pending',
              session_id: sessionId,
              created_at: new Date().toISOString()
            })

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session_id: sessionId,
                name,
                model,
                message: `Claude Code agent "${name}" is starting. It will be ready shortly.`,
                initial_prompt: initial_prompt ? 'Provided' : 'None'
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'send_to_claude_agent',
      'Send a message or command to a running Claude Code agent.',
      {
        session_id: z.string().describe('The Claude agent session ID'),
        message: z.string().describe('Message or instruction to send to Claude')
      },
      async ({ session_id, message }) => {
        try {
          const supabase = getSupabase()

          // Verify the session exists and is a Claude agent
          const { data: session, error: sessionError } = await supabase
            .from('terminal_sessions')
            .select('*')
            .eq('id', session_id)
            .single()

          if (sessionError || !session) {
            return {
              content: [{ type: 'text', text: `Session not found: ${session_id}` }],
              isError: true
            }
          }

          // Queue the message as a command
          const { data, error } = await supabase
            .from('voice_messages_tasks')
            .insert({
              command_text: message,
              intent: 'claude_message',
              parameters: {
                session_id,
                action: 'send_message',
                target: 'claude-code'
              },
              status: 'pending',
              session_id,
              created_at: new Date().toISOString()
            })
            .select()
            .single()

          if (error) {
            return {
              content: [{ type: 'text', text: `Error sending message: ${error.message}` }],
              isError: true
            }
          }

          // Update session activity
          await supabase
            .from('terminal_sessions')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', session_id)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                task_id: data.id,
                session_id,
                session_name: session.name,
                message: `Message sent to Claude agent "${session.name}".`
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_claude_agent_status',
      'Get the current status and recent output from a Claude Code agent.',
      {
        session_id: z.string().describe('The Claude agent session ID')
      },
      async ({ session_id }) => {
        try {
          const supabase = getSupabase()

          // Get session info
          const { data: session, error: sessionError } = await supabase
            .from('terminal_sessions')
            .select('*')
            .eq('id', session_id)
            .single()

          if (sessionError || !session) {
            return {
              content: [{ type: 'text', text: `Session not found: ${session_id}` }],
              isError: true
            }
          }

          // Get recent commands/output for this session
          const { data: recentTasks } = await supabase
            .from('voice_messages_tasks')
            .select('*')
            .eq('session_id', session_id)
            .order('created_at', { ascending: false })
            .limit(5)

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                session: {
                  id: session.id,
                  name: session.name,
                  status: session.status,
                  agent_type: session.agent_type,
                  working_directory: session.working_directory,
                  model: session.metadata?.model,
                  created_at: session.created_at,
                  last_activity: session.last_activity_at
                },
                recent_activity: recentTasks?.map(t => ({
                  id: t.id,
                  command: t.command_text?.substring(0, 100),
                  status: t.status,
                  has_result: !!t.response_data,
                  created_at: t.created_at
                }))
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'list_claude_agents',
      'List all Claude Code agent sessions, both active and recent.',
      {},
      async () => {
        try {
          const supabase = getSupabase()

          const { data, error } = await supabase
            .from('terminal_sessions')
            .select('*')
            .eq('agent_type', 'claude-code')
            .order('created_at', { ascending: false })
            .limit(10)

          if (error) {
            return {
              content: [{ type: 'text', text: `Error listing agents: ${error.message}` }],
              isError: true
            }
          }

          const active = data?.filter(s => s.status === 'active') || []
          const pending = data?.filter(s => s.status === 'pending') || []
          const closed = data?.filter(s => s.status === 'closed') || []

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                summary: {
                  active: active.length,
                  pending: pending.length,
                  closed: closed.length
                },
                agents: data?.map(s => ({
                  id: s.id,
                  name: s.name,
                  status: s.status,
                  model: s.metadata?.model || 'sonnet',
                  working_directory: s.working_directory,
                  created_at: s.created_at,
                  last_activity: s.last_activity_at
                }))
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    // =========================================================================
    // Memory/Context Tools (for voice agent state)
    // =========================================================================

    server.tool(
      'store_memory',
      'Store a piece of information for later retrieval during the conversation.',
      {
        key: z.string().describe('A unique key to identify this memory'),
        value: z.string().describe('The information to store'),
        category: z.string().optional().describe('Optional category for organization')
      },
      async ({ key, value, category }) => {
        try {
          const supabase = getSupabase()

          const { error } = await supabase
            .from('agent_memory')
            .upsert({
              key,
              value,
              category: category || 'general',
              updated_at: new Date().toISOString()
            }, { onConflict: 'key' })

          if (error) {
            return {
              content: [{ type: 'text', text: `Error storing memory: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, stored: key })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'recall_memory',
      'Retrieve previously stored information.',
      {
        key: z.string().optional().describe('Specific key to recall'),
        category: z.string().optional().describe('Category to filter by')
      },
      async ({ key, category }) => {
        try {
          const supabase = getSupabase()

          let query = supabase.from('agent_memory').select('*')

          if (key) {
            query = query.eq('key', key)
          }
          if (category) {
            query = query.eq('category', category)
          }

          const { data, error } = await query.limit(20)

          if (error) {
            return {
              content: [{ type: 'text', text: `Error recalling memory: ${error.message}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, memories: data })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    // =========================================================================
    // Mahana Toolkit Tools (System Knowledge for Agents)
    // =========================================================================

    const TOOLKIT_BASE_URL = process.env.TOOLKIT_BASE_URL || 'https://mahana-mapper.vercel.app'

    server.tool(
      'get_system_toolkit',
      'Get the complete Mahana system toolkit - APIs, CLI commands, imports, costs, and more. Use this to understand what tools and capabilities are available.',
      {
        section: z.enum(['apis', 'cli', 'imports', 'supabase', 'costs', 'transforms', 'pipeline_stages', 'presets', 'data_paths', 'env_vars', 'all']).optional().describe('Specific section to retrieve (default: all)')
      },
      async ({ section = 'all' }) => {
        try {
          const url = section === 'all'
            ? `${TOOLKIT_BASE_URL}/api/toolkit`
            : `${TOOLKIT_BASE_URL}/api/toolkit?section=${section}`

          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                section: section,
                toolkit: data
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching toolkit: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_callable_commands',
      'Get copy-paste ready code snippets and commands for common Mahana operations. Returns markdown with code blocks that can be executed directly.',
      {
        format: z.enum(['markdown', 'json']).optional().describe('Response format - markdown for readable, json for parsed sections')
      },
      async ({ format = 'markdown' }) => {
        try {
          const url = format === 'json'
            ? `${TOOLKIT_BASE_URL}/api/toolkit/commands?format=json`
            : `${TOOLKIT_BASE_URL}/api/toolkit/commands`

          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = format === 'json'
            ? await response.json()
            : await response.text()

          return {
            content: [{
              type: 'text',
              text: format === 'json'
                ? JSON.stringify({ success: true, commands: data })
                : `# Callable Commands\n\n${data}`
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching commands: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_import_statements',
      'Get all import statements for Mahana packages organized by category. Use this to know exactly what to import when writing code.',
      {
        format: z.enum(['typescript', 'json']).optional().describe('Response format - typescript for raw file, json for grouped imports')
      },
      async ({ format = 'json' }) => {
        try {
          const url = format === 'json'
            ? `${TOOLKIT_BASE_URL}/api/toolkit/imports?format=json`
            : `${TOOLKIT_BASE_URL}/api/toolkit/imports`

          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = format === 'json'
            ? await response.json()
            : await response.text()

          return {
            content: [{
              type: 'text',
              text: format === 'json'
                ? JSON.stringify({ success: true, imports: data })
                : data
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching imports: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_api_reference',
      'Get detailed API endpoint reference for Mahana services. Returns endpoints, methods, parameters, and examples.',
      {},
      async () => {
        try {
          const response = await fetch(`${TOOLKIT_BASE_URL}/api/toolkit?section=apis`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                description: 'Mahana API Endpoints',
                apis: data.apis
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching API reference: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_cli_reference',
      'Get all available CLI commands for Mahana. Returns commands organized by category (pipeline, batch, synthesis, utility).',
      {
        category: z.enum(['pipeline', 'batch', 'synthesis', 'utility', 'all']).optional().describe('Command category to retrieve')
      },
      async ({ category = 'all' }) => {
        try {
          const response = await fetch(`${TOOLKIT_BASE_URL}/api/toolkit?section=cli`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()
          const cli = data.cli

          const result = category === 'all'
            ? cli
            : { [category]: cli[category] }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                description: 'Mahana CLI Commands',
                category: category,
                commands: result
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching CLI reference: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_cost_reference',
      'Get cost information for all Mahana operations including AI models, SERP, scraping, geocoding, and full pipeline costs.',
      {},
      async () => {
        try {
          const response = await fetch(`${TOOLKIT_BASE_URL}/api/toolkit?section=costs`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                description: 'Mahana Operation Costs (USD)',
                costs: data.costs
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching cost reference: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'get_pipeline_reference',
      'Get pipeline stage information including function names, costs, and outputs for each stage.',
      {},
      async () => {
        try {
          const response = await fetch(`${TOOLKIT_BASE_URL}/api/toolkit`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                description: 'Mahana Pipeline Stages',
                stages: data.pipeline_stages,
                presets: data.presets
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching pipeline reference: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )

    server.tool(
      'lookup_data_path',
      'Look up file paths for Mahana data storage locations.',
      {
        type: z.enum(['golden_records', 'scraped_data', 'text_corpus', 'embeddings', 'all_images', 'brreg_data', 'musicians', 'dossiers']).describe('Type of data path to look up')
      },
      async ({ type }) => {
        try {
          const response = await fetch(`${TOOLKIT_BASE_URL}/api/toolkit?section=data_paths`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()
          const paths = data.data_paths

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                type: type,
                path: paths[type],
                all_paths: paths
              })
            }]
          }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error fetching data paths: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true
          }
        }
      }
    )
  },
  {
    // Server metadata - wrapped in serverInfo
    serverInfo: {
      name: 'mahana-mcp-server',
      version: '1.0.0',
    }
  },
  {
    // MCP handler options
    // Only pass redisUrl if defined to avoid validation errors
    ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
    basePath: '/api/mcp',
    maxDuration: 60,
  }
)

// Export Next.js route handlers
export { handler as GET, handler as POST }

// Use Node.js runtime (mcp-handler requires node:crypto)
export const runtime = 'nodejs'
export const maxDuration = 60
