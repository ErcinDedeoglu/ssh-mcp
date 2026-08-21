---
name: Feature request
about: Suggest a capability
labels: enhancement
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: The use case matters more than the proposed solution.
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: Command/tool shape, flags, expected output. Sketch is fine.
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Plain ssh, other MCP servers, workflows you use today.
