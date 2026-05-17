import { searchTool } from './search.js';
import { sportsTool } from './sports.js';
import { browserTool } from './browser.js';
import { inferTopic, compressContext } from './memory.js';
import { imageTool } from './image.js';
import { visionTool } from './vision.js';

export const TOOLS = { search: searchTool, sports: sportsTool, browser: browserTool, memory: { inferTopic, compressContext }, image: imageTool, vision: visionTool };
