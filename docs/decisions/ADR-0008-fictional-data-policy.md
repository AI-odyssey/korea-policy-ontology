# ADR-0008: Fictional data policy

Status: accepted

## Context
The design comes from real policy work, which is confidential. A public repository must show the structure without exposing any client, person, strategy or location of real material.

## Decision
- All clients, people, bills, meetings and news are fictional, and every record has `synthetic: true`. A test fails if any record lacks it.
- Real public institutions, their jurisdiction and the legislative process are used as they are: committees and their bill review subcommittees, the Legislation and Judiciary Committee, the plenary, the 40-day legislative notice before a government bill is submitted and numbered. The outdoor-robot scenario amends the rules actually in force since November 2023. No real person's name is used: every invented lawmaker, official and aide name was checked against the 22nd National Assembly member list, and one too close to a sitting member was replaced. Client and organization names were checked against existing companies, and a client name that matched real payment firms was replaced.
- Client industries are chosen to be distinct from any real engagement. Source URLs use the reserved `example.invalid` domain.
- No real paths, identifiers, credentials, or operating numbers from real work appear in the repository. Figures in documentation refer to the synthetic world or are labeled as targets.
- The README states at the top that everything is fictional. A secret and confidentiality scan runs before publishing.

## Amendment: real public records
The live collector (`ingest/`) adds real public records next to the fictional world. They are allowed only as `Signal` and `Evidence` objects with `provenance: public`, `synthetic: false` and the official https link, and the validator rejects public provenance on any other type. People, clients and the whole client layer stay synthetic; nothing collected becomes a stakeholder assessment or a stance about a real person. News is kept as headline, link, outlet and date only. The demo shows these records with a "Public record" chip and keeps them out of the store the assistant, briefs and reports read.

## Consequences
- The repository can be shared without risk to any client.
- Realism is limited to structure and process, which is what the repository is for.
- Anyone who recognizes a real situation in the scenarios should treat it as coincidence and report it so it can be changed.
