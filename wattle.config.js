require('wattle').configure({
    testFiles: ['./tests/**'],
    middleware: ['./tests/setup'],
    tsProject: './tests/tsconfig.json'
});