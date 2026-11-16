// Stands in for Node's `path` and `fs/promises`, which kokoro-js imports to
// read voices from disk. In a browser it checks for readFile, finds none, and
// fetches the voice from Hugging Face instead.
export default {};
