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
