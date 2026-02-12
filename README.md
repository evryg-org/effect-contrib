# effect-contrib

Welcome to the Evryg effect-contrib repository! We develop a set of libraries that complement Effect's official packages for your daily needs.

[Evryg](https://www.evryg.com/en/offers/effect) is a consulting company based in Paris, France with expertise in Effect and the TypeScript ecosystem.

# Community

- [Join Evryg's Discord server](https://discord.gg/7WMGrFwajU)
- [Effect Paris meetup](https://www.meetup.com/fr-FR/effect-paris/) — founded, co-organized, and co-hosted by Evryg

# Contributing via Pull Requests

We welcome contributions via pull requests! Here are some guidelines to help you get started:

## Setting Up Your Environment

Begin by forking the repository and clone it to your local machine.

Navigate into the cloned repository and create a new branch for your changes:

```bash
git checkout -b my-branch
```

Ensure all required dependencies are installed by running:

```bash
pnpm install  # Requires pnpm version 9.0.4
```

## Making Changes

### Implement Your Changes

Make the changes you propose to the codebase. If your changes impact functionality, please **add corresponding tests** to validate your updates.

### Validate Your Changes

Run the following commands to ensure your changes do not introduce any issues:

- `pnpm codegen` (optional): Re-generate the package entrypoints in case you have changed the structure of a package or introduced a new module.
- `pnpm check`: Confirm that the code compiles without errors.
- `pnpm test`: Execute all unit tests to ensure your changes haven't broken existing functionality.
- `pnpm circular`: Check for any circular dependencies in imports.
- `pnpm lint`: Ensure the code adheres to our coding standards.
  - If you encounter style issues, use `pnpm lint-fix` to automatically correct some of these.
- `pnpm dtslint`: Run type-level tests.
- `pnpm docgen`: Ensure the documentation generates correctly and reflects any changes made.

### Document Your Changes

**JSDoc Comments**

When adding a new feature, it's important to document your code using JSDoc comments. This helps other developers understand the purpose and usage of your changes. Include at least the following in your JSDoc comments:

- **A Short Description**: Summarize the purpose and functionality of the feature.
- **Example**: Provide a usage example under the `@example` tag to demonstrate how to use the feature.
- **Since Version**: Use the `@since` tag to indicate the version in which the feature was introduced. If you're unsure about the version, please consult with a project maintainer.
- **Category (Optional)**: You can categorize the feature with the `@category` tag to help organize the documentation. If you're unsure about what category to assign, ask a project maintainer.

**Changeset Documentation**

Before committing your changes, document them with a changeset. This process helps in tracking modifications and effectively communicating them to the project team and users:

```bash
pnpm changeset
```

During the changeset creation process, you will be prompted to select the appropriate level for your changes:

- **patch**: Opt for this if you are making small fixes or minor changes that do not affect the library's overall functionality.
- **minor**: Choose this for new features that enhance functionality but do not disrupt existing features.
- **major**: Select this for any changes that result in backward-incompatible modifications to the library.

## Finalizing Your Contribution

### Commit Your Changes

Once you have documented your changes with a changeset, it’s time to commit them to the repository. Use a clear and descriptive commit message, which could be the same message you used in your changeset:

```bash
git commit -am 'Add some feature'
```

#### Linking to Issues

If your commit addresses an open issue, reference the issue number directly in your commit message. This helps to link your contribution clearly to specific tasks or bug reports. Additionally, if your commit resolves the issue, you can indicate this by adding a phrase like `", closes #<issue-number>"`. For example:

```bash
git commit -am 'Add some feature, closes #123'
```

This practice not only helps in tracking the progress of issues but also automatically closes the issue when the commit is merged, streamlining project management.

### Push to Your Fork

Push the changes up to your GitHub fork:

```bash
git push origin my-branch
```

### Create a Pull Request

Open a pull request against the appropriate branch on the original repository:

- `main` branch: For minor patches or bug fixes.
- `next-minor` branch: For new features that are non-breaking.
- `next-major` branch: For changes that introduce breaking modifications.

Please be patient! We will do our best to review your pull request as soon as possible.
