module.exports = {
    apps: [{
        name: "HashHelpAPI",
        script: "dist/index.js",
        autorestart: true,
        watch: false,
        max_memory_restart: "500M",
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        },
    }],
};
