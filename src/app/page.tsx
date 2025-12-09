export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Mahana MCP Server</h1>
      <p>MCP Server for ElevenLabs Voice Agents</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/mcp/sse</code> - Server-Sent Events transport</li>
        <li><code>/api/mcp/message</code> - HTTP message transport</li>
      </ul>
      <h2>Voice-Terminal Bridge Tools</h2>
      <ul>
        <li><strong>run_terminal_command</strong> - Execute a command in the user&apos;s terminal</li>
        <li><strong>check_command_status</strong> - Check status/result of a submitted command</li>
        <li><strong>get_pending_commands</strong> - List commands waiting to be executed</li>
        <li><strong>get_recent_commands</strong> - Get recently executed commands and results</li>
      </ul>

      <h2>Terminal Session Management</h2>
      <ul>
        <li><strong>create_terminal_session</strong> - Create a new terminal tab</li>
        <li><strong>list_terminal_sessions</strong> - List all active terminal sessions</li>
        <li><strong>switch_terminal_session</strong> - Switch focus to a different terminal</li>
        <li><strong>close_terminal_session</strong> - Close a terminal session</li>
      </ul>

      <h2>Claude Code Agent Tools</h2>
      <ul>
        <li><strong>start_claude_agent</strong> - Start a new Claude Code agent in a terminal</li>
        <li><strong>send_to_claude_agent</strong> - Send message to a running Claude agent</li>
        <li><strong>get_claude_agent_status</strong> - Get status and recent output from Claude agent</li>
        <li><strong>list_claude_agents</strong> - List all Claude Code agent sessions</li>
      </ul>

      <h2>Utility Tools</h2>
      <ul>
        <li><strong>get_current_time</strong> - Get current date/time</li>
      </ul>

      <h2>Supabase Tools</h2>
      <ul>
        <li><strong>supabase_query</strong> - Query Supabase tables</li>
        <li><strong>supabase_insert</strong> - Insert records</li>
        <li><strong>supabase_update</strong> - Update records</li>
        <li><strong>supabase_delete</strong> - Delete records</li>
      </ul>

      <h2>Memory Tools</h2>
      <ul>
        <li><strong>store_memory</strong> - Store agent memory</li>
        <li><strong>recall_memory</strong> - Retrieve agent memory</li>
      </ul>
    </main>
  )
}
