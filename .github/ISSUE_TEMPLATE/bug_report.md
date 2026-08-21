---
name: Bug report
about: Something is broken
labels: bug
blank_issues_enabled: false
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Also state what you expected to happen instead.
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      placeholder: |
        ssh-mcp exec my-server "..."
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      description: "Output of: ssh-mcp --version"
    validations:
      required: true
  - type: dropdown
    id: mode
    attributes:
      label: Mode
      options:
        - CLI
        - MCP server
        - Both
    validations:
      required: true
  - type: input
    id: os
    attributes:
      label: OS + Node version
      description: "e.g. macOS 15, node 22. For remote-server issues also include the remote OS/shell."
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Relevant output
      description: Redact credentials. NEVER paste your config file or private keys.
