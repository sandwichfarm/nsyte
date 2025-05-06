export const version = await Deno.readTextFile("VERSION").then(v => v.trim());
