# Contributing to pollinations.ai

You can contribute code, documentation, bug reports, or apps. Start with an issue that interests you.

## How to Contribute

The repository contains several projects. To get started:

### 1. Explore Projects and Issues

Read the [README](README.md) for an overview of the projects, then browse the [issues](https://github.com/pollinations/pollinations/issues).

Issues labeled `POLLEN-QUEST` are open to multiple solutions; you do not need to claim the issue or wait for assignment before starting. Link your PR with `Fixes #N`. Maintainers compare completed approaches, and the author of the selected merged PR can claim the stated reward.

If a quest asks for an app, submit it with the [app submission form](https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml) and enter the quest number in its Quest field. Approving the app completes the quest, and you can claim the reward.

### 2. Understand the Issue and Build an MVP

Read the issue and the relevant code before making changes. Build the smallest solution that meets the requirements.

If you use a coding agent for a quest, ask it to read the [Ponytail skill](.agents/skills/ponytail/SKILL.md). It encourages reusing existing code and keeping the solution small while preserving required tests and safety checks.

### 3. Documentation Contributions

Help readers understand and use Pollinations. You can contribute by:

- Improving existing documentation to be clearer and more comprehensive.
- Writing new guides or tutorials that explain complex concepts or workflows.
- Providing practical examples of how to use different features of pollinations.ai.
- Creating explanations for the underlying data science and ML principles.

### 4. Build Apps with pollinations.ai

Want to build something cool? Browse the [community apps](https://pollinations.ai/apps) or [submit your own](https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml).

**How it works:**

1. **Propose your app idea** by creating a GitHub issue using the "SubmitApp" template
2. Describe what you want to build and which pollinations.ai APIs you'll use
3. Get feedback from maintainers
4. Build your app and submit a PR

Create apps using pollinations.ai APIs and get them featured. Each app lives in its own folder with clear docs. Perfect for:

- Creative tools (meme generators, art tools)
- Productivity apps (thumbnail creators, content generators)
- Fun projects (games, quizzes)
- Developer tools (API playgrounds, dashboards)

Use the repository's app submission issue form when your app is ready for review.

### 5. Code Contributions

Code contributions include:

- **Bug Fixes:** Fixing behavior that does not work as intended.
- **Feature Enhancements:** Adding or improving features.
- **Code Optimization:** Making code faster, simpler, or easier to maintain.
- **New Functionalities:** Building support for new use cases.

### A Short Hands-on for a Quick Contribution Flow

1. Submit at least one meaningful pull request that gets merged into the repository.
2. Ensure the pull request follows the project's contribution guidelines.
3. The contribution can be related to bug fixes, feature additions, or documentation improvements.

Once your pull request is merged, you will automatically be issued the badge!

## Getting Started

1.  **Fork the Repository**: Click on the "Fork" button at the top right of the repository page to create your own copy of the project under your GitHub account.

2.  **Clone Your Fork**: Clone your forked repository to your local machine. Replace `your-username` with your GitHub username.

    ```bash
    git clone https://github.com/your-username/pollinations.git
    ```

3.  **Create a Branch for Your Work**: Create a new branch for your specific contribution. It's good practice to name your branch related to the issue you're addressing (e.g., `fix/bug-description` or `feat/new-feature-name`).

    ```bash
    git checkout -b my-feature-branch
    ```

4.  **Make Your Changes**: Implement your changes, focusing on the MVP for the chosen issue.

5.  **Commit Your Changes**: Commit your changes with a clear and descriptive message.

    ```bash
    git commit -m "feat: Implement new feature for issue #XYZ"
    ```

    (Replace "XYZ" with the actual issue number)

6.  **Push Your Changes**: Push your local branch with your changes to your forked repository on GitHub.

    ```bash
    git push origin my-feature-branch
    ```

7.  **Create a Pull Request (PR)**: Go to the original `pollinations/pollinations` repository on GitHub. You will see an option to create a Pull Request from your recently pushed branch.
    - **Crucially:** Link your PR to the original issue it addresses (e.g., "Closes #XYZ" in your PR description).
    - Ensure your PR clearly explains the changes you've made and how they resolve the issue.

## Guidelines

Follow the Coding Style: Write your code using the same style and rules that the project already uses. This helps keep the code consistent and easy to read for everyone.

**Code Formatting**: We use [Biome](https://biomejs.dev/) for code formatting and linting. Before submitting your PR:
- Run `npm run format` to auto-format your code
- Run `npm run lint` to check for issues
- Our CI will automatically check formatting on changed files

Write Clear Commit Messages: When saving your changes (committing), write messages that clearly and simply explain what you did and why.

Document Your Changes Well: Add comments to your code where needed to explain how it works. If you are updating or adding documentation, make sure it is clear and accurate.

Test Your Work: If you can, write and run tests to check that your changes work correctly and do not break anything else.

Thank you for contributing.
