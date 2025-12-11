/**
 * Mahana MCP Server for ElevenLabs Voice Agent
 *
 * Provides cloud tools (Supabase, memory, etc.) to ElevenLabs agents.
 * Endpoint: https://mahana-mcp-server.vercel.app/api/mcp
 *
 * Architecture (updated 2025-12):
 *   Voice → MCP → i-View HTTP → Execute → Response (instant)
 *
 * i-View Mini provides direct HTTP endpoints at:
 *   - Dev: http://127.0.0.1:9877
 *   - Prod: http://127.0.0.1:9876
 */

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

// i-View Mini HTTP endpoint (local machine)
const IVIEW_BASE_URL = process.env.IVIEW_BASE_URL || 'http://127.0.0.1:9877'

// Helper to call i-View endpoints
async function callIView<T = unknown>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const { method = 'GET', body } = options
    const url = `${IVIEW_BASE_URL}${endpoint}`

    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` }
    }

    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to connect to i-View',
    }
  }
}

// Initialize Supabase client (still used for cloud data, not terminal commands)
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
    // Voice-Terminal Bridge Tools (Direct i-View HTTP)
    // =========================================================================

    server.tool(
      'run_terminal_command',
      'Execute a command in the user\'s terminal. Use this when the user asks to run shell commands, scripts, or interact with the terminal. Returns output immediately.',
      {
        command: z.string().describe('The terminal command to execute (e.g., "ls -la", "npm install", "git status")'),
        terminal: z.string().optional().describe('Terminal name, ID (m4-t1), or session ID. Defaults to active terminal.'),
        wait: z.number().optional().describe('Time in ms to wait for output (default: 1500)')
      },
      async ({ command, terminal, wait = 1500 }) => {
        try {
          // Call i-View's /quick/run endpoint directly
          const result = await callIView('/quick/run', {
            method: 'POST',
            body: { command, terminal, wait }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          const data = result.data as { success: boolean; terminal: string; output: string[] }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                terminal: data.terminal,
                output: data.output,
                message: `Command executed in terminal ${data.terminal}`
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
      'get_terminal_output',
      'Get output from a terminal. Use to see what a command produced or check terminal state.',
      {
        terminal: z.string().optional().describe('Terminal name, ID, or session ID. Defaults to active terminal.'),
        lines: z.number().optional().describe('Number of lines to return (default: 30)')
      },
      async ({ terminal, lines = 30 }) => {
        try {
          const result = await callIView(`/terminal/output?lines=${lines}${terminal ? `&terminal=${terminal}` : ''}`)

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'get_system_health',
      'Get system health status including device info, terminals, browser state.',
      {},
      async () => {
        try {
          const result = await callIView('/quick/health')

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'get_snapshot',
      'Get a snapshot of the current state: screenshot + console logs + terminal state. Very useful for understanding what\'s happening.',
      {},
      async () => {
        try {
          const result = await callIView('/quick/snapshot')

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'broadcast_command',
      'Send the same command to multiple terminals at once.',
      {
        command: z.string().describe('Command to broadcast'),
        terminals: z.array(z.string()).optional().describe('Array of terminal names/IDs. If empty, sends to all.')
      },
      async ({ command, terminals }) => {
        try {
          const result = await callIView('/quick/broadcast', {
            method: 'POST',
            body: { command, terminals }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
    // Terminal Session Management Tools (Direct i-View HTTP)
    // =========================================================================

    server.tool(
      'create_terminal_session',
      'Create a new terminal session with optional Claude agent spawn.',
      {
        name: z.string().describe('Friendly name for the session (e.g., "Backend Agent", "Build Server")'),
        workingDirectory: z.string().optional().describe('Starting directory for the terminal'),
        spawnAgent: z.boolean().optional().describe('Whether to spawn a Claude mini agent in this terminal')
      },
      async ({ name, workingDirectory, spawnAgent }) => {
        try {
          // Call i-View's /quick/session endpoint directly
          const result = await callIView('/quick/session', {
            method: 'POST',
            body: { name, workingDirectory, spawnAgent }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...(result.data && typeof result.data === 'object' ? result.data : {}),
                message: `Session "${name}" created${spawnAgent ? ' with Claude mini' : ''}`
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
      'list_terminals',
      'List all active terminals with their state (sleeping, working, waiting, error).',
      {},
      async () => {
        try {
          const result = await callIView('/quick/terminals')

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'list_sessions',
      'List all sessions with neuropacket counts and memory status.',
      {},
      async () => {
        try {
          const result = await callIView('/quick/sessions')

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'delete_session',
      'Delete a session by name or ID.',
      {
        name: z.string().optional().describe('Session name to delete'),
        sessionId: z.string().optional().describe('Session ID to delete')
      },
      async ({ name, sessionId }) => {
        try {
          const params = new URLSearchParams()
          if (name) params.set('name', name)
          if (sessionId) params.set('id', sessionId)

          const result = await callIView(`/quick/session?${params.toString()}`, {
            method: 'DELETE'
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'get_session_memory',
      'Get compiled session memory (SESSION_MEMORY.md) for a terminal.',
      {
        terminal: z.string().optional().describe('Terminal name, ID, or session ID')
      },
      async ({ terminal }) => {
        try {
          const result = await callIView(`/quick/memory${terminal ? `?terminal=${terminal}` : ''}`)

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
    // Claude Code Agent Tools (Direct i-View HTTP)
    // =========================================================================

    server.tool(
      'spawn_claude_mini',
      'Spawn a Claude mini agent (--dangerously-skip-permissions) in a terminal. Instant and ready for commands.',
      {
        terminal: z.string().optional().describe('Terminal name, ID, or session ID. Uses active terminal if not specified.'),
        cwd: z.string().optional().describe('Working directory to start in'),
        firstMessage: z.string().optional().describe('Initial message to send to Claude after startup'),
        waitForReady: z.number().optional().describe('Time in ms to wait for Claude to be ready (default: 3000)')
      },
      async ({ terminal, cwd, firstMessage, waitForReady }) => {
        try {
          // Call i-View's /quick/mini endpoint directly
          const result = await callIView('/quick/mini', {
            method: 'POST',
            body: { terminal, cwd, firstMessage, waitForReady }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...(result.data && typeof result.data === 'object' ? result.data : {}),
                message: 'Claude mini spawned and ready'
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
      'send_to_agent',
      'Send a message to a running Claude agent. Supports different modes: prompt (existing Claude), mini (spawn mini), claude (spawn standard).',
      {
        message: z.string().describe('Message to send to Claude'),
        terminal: z.string().optional().describe('Terminal name, ID, or session ID'),
        mode: z.enum(['prompt', 'mini', 'claude']).optional().describe('Mode: prompt (existing), mini (spawn mini), claude (spawn standard). Default: prompt')
      },
      async ({ message, terminal, mode = 'prompt' }) => {
        try {
          // Call i-View's /quick/agent endpoint directly
          const result = await callIView('/quick/agent', {
            method: 'POST',
            body: { message, terminal, mode }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...(result.data && typeof result.data === 'object' ? result.data : {}),
                message: `Message sent to Claude agent`
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
      'list_agents',
      'List all Claude agents across terminals with their current state.',
      {},
      async () => {
        try {
          const result = await callIView('/quick/agents')

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
    // Browser Automation Tools (Direct i-View HTTP)
    // =========================================================================

    server.tool(
      'navigate_browser',
      'Navigate the browser to a URL.',
      {
        url: z.string().describe('URL to navigate to')
      },
      async ({ url }) => {
        try {
          const result = await callIView('/navigate', {
            method: 'POST',
            body: { url }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                ...(result.data && typeof result.data === 'object' ? result.data : {}),
                message: `Navigated to ${url}`
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
      'click_element',
      'Click an element in the browser by selector or text.',
      {
        selector: z.string().optional().describe('CSS selector to click'),
        text: z.string().optional().describe('Text content to find and click')
      },
      async ({ selector, text }) => {
        try {
          const result = await callIView('/webview/click', {
            method: 'POST',
            body: { selector, text }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'fill_input',
      'Fill an input field in the browser.',
      {
        selector: z.string().describe('CSS selector for the input'),
        value: z.string().describe('Value to fill')
      },
      async ({ selector, value }) => {
        try {
          const result = await callIView('/webview/fill', {
            method: 'POST',
            body: { selector, value }
          })

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'take_screenshot',
      'Take a screenshot of the current browser view. Returns base64 encoded image.',
      {
        preset: z.enum(['fast', 'balanced', 'thumbnail', 'quality']).optional().describe('Screenshot preset (default: fast)')
      },
      async ({ preset = 'fast' }) => {
        try {
          const result = await callIView(`/screenshot/webview?preset=${preset}`)

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'get_console_logs',
      'Get console logs from the browser.',
      {
        level: z.enum(['all', 'error', 'warn', 'log']).optional().describe('Filter by log level')
      },
      async ({ level = 'all' }) => {
        try {
          const result = await callIView(`/webview/console${level !== 'all' ? `?level=${level}` : ''}`)

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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
      'query_elements',
      'Query elements in the browser by selector.',
      {
        selector: z.string().describe('CSS selector to query'),
        limit: z.number().optional().describe('Maximum elements to return')
      },
      async ({ selector, limit }) => {
        try {
          const params = new URLSearchParams({ selector })
          if (limit) params.set('limit', limit.toString())

          const result = await callIView(`/webview/elements?${params.toString()}`)

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.data)
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

// API Key authentication wrapper
const MCP_API_KEY = process.env.MCP_API_KEY

function withAuth(mcpHandler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    // If no API key configured, allow all (dev mode)
    if (!MCP_API_KEY) {
      console.warn('[MCP] No MCP_API_KEY configured - running in open mode')
      return mcpHandler(req)
    }

    // Check for API key in header
    const providedKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')

    if (providedKey !== MCP_API_KEY) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: Invalid or missing API key' },
        id: null
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return mcpHandler(req)
  }
}

// Export Next.js route handlers with auth
export const GET = withAuth(handler)
export const POST = withAuth(handler)

// Use Node.js runtime (mcp-handler requires node:crypto)
export const runtime = 'nodejs'
export const maxDuration = 60
