# Lichess Backend Reference

This directory contains a git submodule reference to the [Lichess.org backend repository](https://github.com/lichess-org/lila).

## Purpose

This reference is included for **study and architectural inspiration only**. It helps us understand:
- How Lichess implements game logic, WebSocket handling, and real-time features
- Best practices for chess application architecture
- Patterns for scalable game servers

## Important Notes

⚠️ **License**: Lichess is licensed under AGPL-3.0, which is a copyleft license. This means:
- You can study and learn from their code
- If you directly use their code in a derivative work, your entire project must also be AGPL-3.0
- For our Django/Python implementation, we're implementing similar patterns from scratch

⚠️ **Technology Stack**: 
- **Lichess**: Written in Scala using the Play Framework
- **DigiChess**: Written in Python using Django
- We cannot directly use Lichess code, but we can learn from their architecture

## Key Modules to Study

- `modules/game/` - Game logic, move validation, time control
- `modules/round/` - Round management, WebSocket handling
- `modules/simul/` - Simultaneous games
- `modules/tournament/` - Tournament logic
- `modules/relay/` - Relay games
- `modules/api/` - API endpoints

## Usage

To update the reference to the latest Lichess code:

```bash
git submodule update --remote lichess-reference
```

To initialize after cloning:

```bash
git submodule update --init --recursive
```

## Our Implementation

Our DigiChess backend implements similar concepts using Django:
- `games/` - Game models, views, and logic
- `games/consumers.py` - WebSocket consumers (similar to Lichess round handlers)
- `games/lichess_api.py` - Integration with Lichess public APIs

## References

- [Lichess Source Code](https://github.com/lichess-org/lila)
- [Lichess API Documentation](https://lichess.org/api)
- [Lichess Open Source](https://lichess.org/source)

