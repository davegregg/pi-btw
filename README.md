# pi-btw

A small [pi](https://github.com/badlogic/pi-mono) extension that adds two side-conversation channels:

- `/btw` for a contextual parallel aside
- `/tangent` for an isolated, ephemeral side conversation

Both run immediately, even while the main agent is still busy.

![BTW overlay example](docs/btw-overlay.png)

## What it does

- opens a parallel side conversation without interrupting the main run
- streams answers into a widget above the editor
- keeps side-thread entries out of the main agent's future context
- supports two different workflows:
  - `/btw` continues a side thread that can use the current session for context
  - `/tangent` continues a side thread that does **not** use the current session's context
- lets you inject the full BTW thread, or a summary of it, back into the main agent
- optionally saves an individual BTW exchange as a visible session note with `--save`

## Install

### From npm (after publish)

```bash
pi install npm:pi-btw
```

### From git

```bash
pi install git:github.com/dbachelder/pi-btw
```

Then reload pi:

```text
/reload
```

### From a local checkout

```bash
pi install /absolute/path/to/pi-btw
```

## Usage

```text
/btw what file defines this route?
/btw how would you refactor this parser?
/btw --save summarize the last error in one sentence
/btw:new let's start a fresh thread about auth
/btw:inject implement the plan we just discussed
/btw:summarize turn that side thread into a short handoff
/btw:clear

/tangent explain this regex in general terms
/tangent:new compare event sourcing vs CRUD for a greenfield service
/tangent:clear
```

## Commands

### `/btw [--save] <question>`

- runs right away
- works while pi is busy
- continues the current BTW thread
- streams into a widget above the editor
- persists the BTW exchange as hidden thread state
- uses the current session as context for the side conversation
- with `--save`, also saves that single exchange as a visible session note

### `/btw:new [question]`

- clears the current BTW thread
- optionally asks the first question in the new thread immediately

### `/btw:clear`

- dismisses the BTW widget
- clears the current BTW thread

### `/btw:inject [instructions]`

- sends the full BTW thread back to the main agent as a user message
- if pi is busy, queues it as a follow-up
- clears the BTW thread after sending

### `/btw:summarize [instructions]`

- summarizes the BTW thread with the current model
- injects the summary into the main agent
- if pi is busy, queues it as a follow-up
- clears the BTW thread after sending

### `/tangent <question>`

- runs right away
- works while pi is busy
- continues the current tangent thread
- streams into a widget above the editor
- does **not** use the current session's context
- keeps the tangent thread in memory only

### `/tangent:new [question]`

- clears the current tangent thread
- optionally asks the first question in the new thread immediately

### `/tangent:clear`

- dismisses the tangent widget
- clears the current tangent thread

## Behavior

### Hidden BTW thread state

BTW exchanges are persisted in the session as hidden custom entries so they:

- survive reloads and restarts
- rehydrate the BTW widget for the current branch
- stay out of the main agent's LLM context

### Visible saved notes

If you use `--save`, that one BTW exchange is also written as a visible custom message in the session transcript.

### Ephemeral tangent state

Tangent exchanges are intentionally more disposable:

- they do **not** read the current session's message history
- they are kept only in memory for the current tangent thread
- they disappear on reload or session switch
- they are not injected back into the main agent unless you manually copy something over

## Why

Sometimes you want to:

- ask a clarifying question while the main agent keeps working
- think through next steps without derailing the current turn
- explore an idea with session context available via `/btw`
- sanity-check an unrelated idea without any session context via `/tangent`

## Included skills

This package also ships small `btw` and `tangent` skills so pi can better recognize when these side-conversation workflows are appropriate.

They help with discoverability and guidance, but they are not required for the extension itself to work.

## Development

The extension entrypoints are:

- `extensions/btw.ts`
- `extensions/tangent.ts`

The included skills are:

- `skills/btw/SKILL.md`
- `skills/tangent/SKILL.md`

To use it without installing:

```bash
pi -e /path/to/pi-btw
```

## License

MIT
