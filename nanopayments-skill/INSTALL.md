# Nanopayments Skill — Install

Works with **Cursor** and **Claude Code**.

## Quick start

```bash
# Unzip, then run:
mkdir -p ~/.agents/skills
cp -r nanopayments-skill ~/.agents/skills/

# Symlink into the tools you use:
mkdir -p ~/.cursor/skills && ln -s ~/.agents/skills/nanopayments-skill ~/.cursor/skills/nanopayments-skill
mkdir -p ~/.claude/skills && ln -s ~/.agents/skills/nanopayments-skill ~/.claude/skills/nanopayments-skill
```

Restart Cursor or start a new Claude Code session.

## Verify

Ask your agent: "What skills do you have?" — you should see **nanopayments-skill**.

## Updating

Replace the shared copy. Symlinks pick up changes automatically.

```bash
rm -rf ~/.agents/skills/nanopayments-skill
cp -r nanopayments-skill ~/.agents/skills/
```

## Uninstall

```bash
rm -f ~/.cursor/skills/nanopayments-skill ~/.claude/skills/nanopayments-skill
rm -rf ~/.agents/skills/nanopayments-skill
```
