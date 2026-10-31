const lintStagedConfig = {
  // Whole-project commands must not receive lint-staged's appended file arguments.
  "*.{ts,tsx,js,jsx}": () => ["yarn tsc", "yarn format:fix", "yarn lint"],
}

export default lintStagedConfig
