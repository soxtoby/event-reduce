require('wattle').configure({
    testFiles: ['./tests-legacy/**'],
    middleware: ['./tests-legacy/setup'],
    tsProject: './tests-legacy/tsconfig.json',
    processCount: 0
});