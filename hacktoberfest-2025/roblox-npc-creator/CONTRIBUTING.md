# 🤝 Contributing to Roblox AI NPC Creator

Thanks for your interest in contributing! This project is part of **Hacktoberfest 2025** 🎃

## Quick Start

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/YOUR-USERNAME/pollinations.git`
3. **Navigate to project**: `cd pollinations/hacktoberfest-2025/roblox-npc-creator`
4. **Install Rojo**: `aftman install`
5. **Start Rojo**: `rojo serve`
6. **Connect from Studio**: 
   - Open Roblox Studio (new Baseplate)
   - Click Rojo plugin → Connect
7. **Edit code** in VS Code (syncs to Studio automatically)
8. **Test** in Studio (press F5)
9. **Commit & push**: Standard Git workflow
10. **Open a Pull Request**

## 🎯 Good First Issues

Perfect for Hacktoberfest beginners:

- **Add conversation memory** - Store last 5-10 messages for context
- **Add voice responses** - Integrate Pollinations audio API
- **Add multiple NPC personalities** - Create personality presets
- **Add NPC emotions** - Visual feedback based on conversation
- **Improve UI** - Better chat interface, animations
- **Add quest system** - Simple dialogue tree implementation
- **Add admin commands** - Control NPCs via chat commands
- **Documentation** - Improve README, add tutorials
- **Add examples** - Create example NPCs with different personalities

## 📋 Contribution Guidelines

### Code Quality
- ✅ Test your code in Roblox Studio before submitting
- ✅ Follow Lua best practices
- ✅ Add comments for complex logic
- ✅ Keep functions small and focused

### Commit Messages
Use clear, descriptive commit messages:
- `Add: conversation memory system`
- `Fix: chat UI not closing properly`
- `Improve: API error handling`
- `Docs: add voice API tutorial`

### Pull Request Guidelines
- **One feature per PR** - Keep PRs focused
- **Test thoroughly** - Make sure it works in Studio
- **Describe your changes** - What does it do? Why?
- **Link related issues** - Reference issue numbers

### What We're Looking For
✅ **Quality over quantity** - Meaningful contributions
✅ **Useful features** - Things that improve the project
✅ **Good documentation** - Help others understand
✅ **Bug fixes** - Make it more stable
✅ **Examples** - Show what's possible

### What We're NOT Looking For
❌ Spam PRs (adding your name to a list)
❌ Trivial changes (whitespace, typos in comments)
❌ Duplicate PRs
❌ Breaking changes without discussion

## 🐛 Found a Bug?

1. **Check existing issues** - Maybe it's already reported
2. **Create a new issue** with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if relevant
3. **Label it** as `bug`

## 💡 Have an Idea?

1. **Check existing issues** - Maybe someone suggested it
2. **Create a new issue** with:
   - Clear description
   - Use cases
   - Why it would be useful
3. **Label it** as `enhancement`

## 🎨 Project Structure

```
roblox-npc-creator/
├── src/
│   ├── ServerScriptService/    # Server-side code
│   ├── StarterPlayer/           # Client-side code
│   ├── StarterGui/              # UI components
│   └── ReplicatedStorage/       # Shared code
├── models/                      # NPC models
└── default.project.json         # Rojo configuration
```

## 🧪 Testing

1. **Install Rojo**: `aftman install`
2. **Start Rojo**: `rojo serve`
3. **Connect from Studio**: Use Rojo plugin
4. **Enable HTTP**: Game Settings → Security
5. **Test your changes**: Press F5 in Studio

## 📚 Resources

- [Pollinations API Docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
- [Rojo Documentation](https://rojo.space/docs/)
- [Roblox Creator Hub](https://create.roblox.com/)
- [Lua Style Guide](https://roblox.github.io/lua-style-guide/)

## 🎃 Hacktoberfest Rules

- Submit **6 quality PRs** between Oct 1-31
- PRs must be **accepted by maintainers**
- **No spam** - quality over quantity
- Be **respectful** and **helpful**

## 💬 Questions?

- Open an issue with the `question` label
- Join the [Pollinations Discord](https://discord.gg/8HqSRhJVxn)

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to learn and build cool stuff together!

---

**Happy Hacking! 🌸**
