export function getSafetyScore(location){
    if(!location) return 50;
    // Use time of day, lat/lon roughness, speed heuristics in real model
    // placeholder returns dynamic value based on latitude to show variability
    const base = 80;
    const variability = Math.abs(Math.floor((location.latitude||0)*10)%40);
    const score = Math.max(10, Math.min(100, base - variability));
    return score;
    }