---
name: tangent
description: Helps you use the /tangent isolated-question workflow. Use when you want an answer that should ignore the current session and should not become part of the session's future context.
---

# TANGENT

Use this skill when the user wants a completely isolated side question.

## When to use `/tangent`

Prefer `/tangent` when the user wants to:

- ask a question that should **not** use the current session as context
- avoid polluting future context with an exploratory or off-topic question
- get a one-off answer while keeping the main session clean
- sanity-check an idea without making it part of the conversation state

## Commands

```text
/tangent <question>
/tangent:new [question]
/tangent:clear
```

## Recommendation rules

- Prefer `/tangent` over normal chat when the user explicitly wants isolation from the current session.
- Prefer `/tangent` over `/btw` when the user does **not** want the side conversation to inherit current-session context.
- Prefer `/tangent:new` when the widget should be cleared before asking another isolated question.
- Prefer `/tangent:clear` when the user wants to dismiss tangent output entirely.

## How to guide the user

- give the exact slash command to run
- explain briefly that it is isolated and ephemeral
- keep the guidance short and operational

## Examples

```text
/tangent explain this regex in general terms
/tangent compare event sourcing vs CRUD for a greenfield service
/tangent:new what are the tradeoffs of using SQLite here?
```
