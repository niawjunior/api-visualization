const { spawn } = require('child_process');
const path = require('path');

const projectPath = '/Users/niawjunior/desktop/cib-lightwork-backend';
const analyzersDir = __dirname;

const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
};

const pythonProcess = spawn('python3', ['-m', 'scanner', projectPath], {
    env,
    cwd: analyzersDir
});

let stdoutData = '';

pythonProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
});

pythonProcess.on('close', (code) => {
    try {
        const jsonStart = stdoutData.indexOf('[');
        const jsonEnd = stdoutData.lastIndexOf(']');
        const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);
        
        const poolStats = data.find(r => r.path.includes('pool-stats'));
        console.log(JSON.stringify(poolStats, null, 2));
    } catch (e) {
        console.error(e);
    }
});
