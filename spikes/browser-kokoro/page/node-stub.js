// kokoro-js's unbundled build imports Node's `path` and `fs/promises` to read
// voices from disk. In a browser it checks for `readFile`, finds none, and
// fetches the voice from Hugging Face instead, so an empty module is enough.
export default {};
