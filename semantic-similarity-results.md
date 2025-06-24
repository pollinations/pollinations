# Semantic Cache Similarity Test Results

## Current Threshold: 0.5 (50%)

### High Similarity (Expected Hits)
| Prompt | Similarity | Match Type |
|--------|------------|------------|
| little orange cat | 98.7% | ✅ Semantic HIT |
| tiny cat orange | 98.3% | ✅ Semantic HIT |
| orange cat | 95.8% | ✅ Semantic HIT |
| miniature orange kitty | 95.2% | ✅ Semantic HIT |
| petite orange kitten | 93.5% | ✅ Semantic HIT |
| large orange cat | 92.9% | ✅ Semantic HIT |

### Medium Similarity (Borderline)
| Prompt | Similarity | Match Type |
|--------|------------|------------|
| yellow cat | 91.7% | ✅ Semantic HIT |
| small feline | 91.6% | ✅ Semantic HIT |
| cute kitten | 90.1% | ✅ Semantic HIT |
| orange tiger | 89.9% | ✅ Semantic HIT |
| black cat | 89.0% | ✅ Semantic HIT |
| tiny orange car | 88.8% | ⚠️ Semantic HIT (wrong subject!) |
| ginger cat | 88.4% | ✅ Semantic HIT |
| orange animal | 87.5% | ✅ Semantic HIT |
| red cat | 87.4% | ✅ Semantic HIT |
| tiny pet | 86.7% | ✅ Semantic HIT |

### Low Similarity (Should be Misses)
| Prompt | Similarity | Match Type |
|--------|------------|------------|
| purple elephant | 82.9% | ❌ Semantic HIT (completely unrelated!) |
| orange sunset | 82.6% | ❌ Semantic HIT (wrong subject!) |
| blue dog | 82.2% | ❌ Semantic HIT (wrong animal & color!) |
| green parrot | 80.2% | ❌ Semantic HIT (completely different!) |
| small orange fruit | 80.2% | ❌ Semantic HIT (not an animal!) |

## Observations

1. **Threshold Too Low**: At 50%, even completely unrelated concepts are matching
2. **Word Overlap Dominates**: Prompts with ANY shared words (like "orange" or "tiny") match regardless of subject
3. **Subject Doesn't Matter**: "tiny orange car" matches "tiny orange cat" at 88.8%!

## Recommended Thresholds

- **0.90 (90%)**: Very similar prompts only (same animal, similar descriptors)
- **0.85 (85%)**: Reasonable semantic similarity (excludes non-animals)
- **0.80 (80%)**: Too permissive (includes unrelated subjects)
- **0.70 (70%)**: Way too permissive (everything matches)
- **0.50 (50%)**: Current - essentially useless

## Suggested Production Threshold: 0.85-0.90
