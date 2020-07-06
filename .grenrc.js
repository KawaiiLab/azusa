module.exports = {
    "dataSource": "commits",
    "includeMessages": "all",
    "changelogFilename": "CHANGELOG.md",
    "template": {
        commit: ({ message, url, author, name }) => `- [${message}](${url})`
    }
}