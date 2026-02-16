# Contributing to pollinations.ai

Thank you for choosing `pollinations.ai` for GSOC 26'! We are excited to have you on board and look forward to your contributions. This guide will help you understand how to contribute effectively to the project.

## How to Contribute

We have multiple projects listed under our organization for GSOC 26 that can be found at the [Projects Page](https://gsoc.pollinations.ai/projects).

### 1. Explore Projects under GSOC 26'

Before you start, please refer to the main [`README.md`](../../../../README.md) file of the `pollinations.ai` repository, this way you will have an overall idea on the product. 

> For GSOC 26' you will be working on the projects listed under the [GSOC Projects Page](https://gsoc.pollinations.ai/projects). 

- Each project has a set of objectives which you can read from the site.
- Once your skillset aligns with the project objectives, you can choose to apply a proposal for the project. Please feel free to include your own ideas and suggestions in the proposal.
- The application shall be submitted through the [Google Summer of Code Website](https://summerofcode.withgoogle.com/) once the application period opens.


### 2. After Selecting a Project

- Once your application is reviewed we will rank your application based on various parameters and it will be sent to Google for final review.
- Depending on the Timeline as mentioned in the [GSOC 26' Timeline](https://summerofcode.withgoogle.com/how-it-works/#timeline), you will be notified if you have been accepted for the program this season.
- If your application is selected we will run through a quick onboarding session with you to help you understand the pollinations codebase and for regulating your understanding with the project mentor and the best practices.

### 3. Building the project under GSOC 26'

- Once onboarded, you can start working on the project as per the timeline.
- The mentor will help you with the tasks and guide you through the development process.
- We expect nearly 4-6 hours of engagement per week during the coding period based on the project complexity.
- Your work will be evaluated based on the milestones set in the project objectives. 
- Sync calls and weekly reports will be made for ease of understanding.
- Communication will be available through discord channel and email throughout.
- Feel free to communicate with your mentor for any help or guidance or contact at gsoc@pollinations.ai.

For the time being, you will be onboarded as an external contributor to the repository. With that being set, you shall be working on a specific feature branch created for your project. You can set a tracking issue within the repository to track your progress and link your pull requests to the issue.

## Getting Started (version control basics)

1.  **Create a Branch for Your Work**: Create a new branch for your specific contribution. It's good practice to name your branch related to the issue you're addressing (`gsoc/projectID`).

    ```bash
    git checkout -b `gsoc/projectID`
    ```
2.  **Make Your Changes**: Implement your changes, focusing on the MVP for the chosen issue.
3.  **Commit Your Changes**: Commit your changes with a clear and descriptive message.
    ```bash
    git commit -m "feat: COMMIT MESSAGE"
    ```
    (Replace "XYZ" with the actual issue number)
4.  **Push Your Changes**: Push your local branch with your changes to your forked repository on GitHub.
    ```bash
    git push origin `gsoc/projectID`
    ```

## Guidelines

The mentors would align you with the coding style for the repository and the directory structure we follow. Alongside you shall be introduced to the best practices for code and communication during the program.

Write Clear Commit Messages: When saving your changes (committing), write messages that clearly and simply explain what you did and why.

Document Your Changes Well: Add comments to your code where needed to explain how it works. If you are updating or adding documentation, make sure it is clear and accurate.

Test Your Work: If you can, write and run tests to check that your changes work correctly and do not break anything else.

