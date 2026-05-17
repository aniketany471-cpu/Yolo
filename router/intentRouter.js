const REALTIME_KW = ["live","latest","current","today","now","score","weather","price","breaking","schedule","standing"];
const SPORTS_KW = ["ipl","cricket","nba","f1","football","soccer","match","wicket","overs","goal","standings"];

export function detectIntent(prompt = "") {
  const p = prompt.toLowerCase();
  const sportsHits = SPORTS_KW.filter((k) => p.includes(k)).length;
  const realtimeHits = REALTIME_KW.filter((k) => p.includes(k)).length;
  const isSports = sportsHits >= 1;
  const isRealtime = realtimeHits >= 1;
  const isCoding = /(code|bug|stack trace|javascript|python|node|api|sql|regex|function)/i.test(prompt);
  const isImageGeneration = /(generate|create|make|draw|design|render).{0,60}(image|photo|wallpaper|logo|art|thumbnail|illustration|portrait)/i.test(prompt);
  const isWebSearch = /(search|look up|find|verify|news|who is|what happened)/i.test(prompt) || isRealtime;
  const confidence = Math.min(1, (sportsHits * 0.25) + (realtimeHits * 0.15) + (isCoding ? 0.35 : 0) + (isImageGeneration ? 0.45 : 0));
  const intent = isSports ? "sports" : isImageGeneration ? "image_generation" : isCoding ? "coding" : isWebSearch ? "web_search" : "casual_chat";
  return { intent, isSports, isRealtime, isCoding, isImageGeneration, isWebSearch, confidence, sportsHits, realtimeHits };
}
