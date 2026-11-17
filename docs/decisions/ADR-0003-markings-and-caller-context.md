# ADR-0003: Markings and caller-context filtering, not one graph with a client field

Status: accepted

## Context
Two clients can care about the same bill with opposite positions, and can read the same lawmaker differently. What is known about one must not reach the other. A single graph with a client property is easy to build and easy to leak from, especially through traversals, counts and logs.

## Decision
Split a public layer (`PUBLIC`) from client layers (`CLIENT:<clientId>`). Client objects may point to public objects; public objects never point to client objects. Every read goes through a view built from the caller context (actor, role, assigned client ids), which filters by marking in `get`, `list` and every link traversal; a link is visible only if both ends are. Objects created by a client action are marked with that action's client. One action call may name objects from only one client layer; a call that joins two is refused before it runs. Activity-log entries are marked by the client layers they touched, and an action on public objects taken in a client workspace is filed under that client.

## Consequences
- The leak property is simple to state and to test: an Aster context returns no Moru or Wrenfield object, link or log entry through any path.
- Filtering sits in the runtime, so a screen bug cannot expose data.
- Cross-client citations (an Aster assessment resting on a Moru meeting) are refused at write time, and the validator catches any that reach the world file.
- Queries are slightly more constrained.
- In a real deployment the same filter must run on a server behind authentication.
