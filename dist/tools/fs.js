"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fsTools = void 0;
const read_1 = require("./lib/read");
const analyze_1 = require("./lib/analyze");
exports.fsTools = {
    ...read_1.readTools,
    ...analyze_1.analyzeTools,
};
