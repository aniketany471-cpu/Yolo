const REALTIME_KW = ["live","latest","current","today","now","score","weather","price","breaking","schedule","standing"];
const SPORTS_KW = ["ipl","cricket","nba","f1","football","soccer","match","wicket","overs","goal","standings"];

export function detectIntent(prompt = "") {
  const p = prompt.toLowerCase();
  const sportsHits = SPORTS_KW.filter((k) => p.includes(k)).length;
  const realtimeHits = REALTIME_KW.filter((k) => p.includes(k)).length;
  const isSports = sportsHits >= 1;
  const isRealtime = realtimeHits >= 1;
  const isCoding = /(code|bug|stack trace|javascript|python|node|api|sql|regex|function)/i.test(prompt);

  // FIX-1: Expanded verb list (show/send/give/produce/visualize/imagine/sketch/depict/paint)
  // and expanded noun list (pic/picture/artwork/anime/drawing/banner/poster/scene).
  // The .{0,80} window accommodates "me a", "me the", "me some" between verb and noun.
  const isImageGeneration = /(generate|create|make|draw|design|render|show|send|give|produce|visualize|imagine|sketch|depict|paint).{0,80}(image|photo|\bpic\b|picture|wallpaper|logo|\bart\b|artwork|thumbnail|illustration|portrait|anime|drawing|banner|poster|scene|landscape|mural|graphic|background|scenery)/i.test(prompt);

  const isWebSearch = /(search|look up|find|verify|news|who is|what happened)/i.test(prompt) || isRealtime;
  const confidence = Math.min(1, (sportsHits * 0.25) + (realtimeHits * 0.15) + (isCoding ? 0.35 : 0) + (isImageGeneration ? 0.45 : 0));

  // FIX-2: isImageGeneration is evaluated BEFORE isSports so "generate cricket wallpaper"
  // correctly routes to image_generation, not sports search.
  const intent = isImageGeneration ? "image_generation" : isSports ? "sports" : isCoding ? "coding" : isWebSearch ? "web_search" : "casual_chat";

  return { intent, isSports, isRealtime, isCoding, isImageGeneration, isWebSearch, confidence, sportsHits, realtimeHits };
}
