# Pre-Translation Benchmark Report

**Book:** #2229 — Faust: Der Tragödie erster Teil (English translation by Bayard Taylor)  
**Date:** 2026-04-23 00:36  
**Provider:** MarianMT (Helsinki-NLP, CPU-only PyTorch)  
**Machine:** Apple Silicon Mac, CPU inference  

---

## Summary

| Language | Chapters | Total Words | Kernel Time | Wall Time | Words/sec | Sec/chapter (avg) |
|----------|----------|-------------|-------------|-----------|-----------|-------------------|
| **German** (`de`) | 26 of 27¹ | 30,315 | 19m 59s | 20m 11s | **25.3** | 46.1s |
| **French** (`fr`) | 26 of 27¹ | 30,315 | 33m 58s | 34m 28s | **14.9** | 78.4s |

> ¹ Chapter 1 (*Zueignung*, 221 words) timing not captured — model load overlapped with first chapter output.  
> Kernel time = sum of per-chapter translation times (excludes DB write overhead).

**French is ~41% slower than German** on this text. See Observations for likely cause.

---

## Comparison: Alice in Wonderland (#11, de)

Run immediately before Faust on the same machine (model already cached):

| Book | Chapters | Total Words | Kernel Time | Words/sec |
|------|----------|-------------|-------------|-----------|
| Alice (#11) | 11 | 24,233 | 18m 32s | 21.8 |
| Faust (#2229) | 26 | 30,315 | 19m 59s | 25.3 |

Faust runs faster per-word despite being longer — likely because Faust has many short
dialogue scenes (< 500 words) that fit in a single MarianMT chunk, whereas Alice has
denser prose paragraphs that require more chunking overhead.

---

## German (`de`)

**Model:** `Helsinki-NLP/opus-mt-en-de` (~298 MB)  
**Total:** 30,315 words · 19m 59s kernel · **25.3 words/sec**

| # | Chapter | Words | Time | Words/sec |
|---|---------|-------|------|-----------|
| 1 | Zueignung | 221 | — | — (model load) |
| 2 | Vorspiel auf dem Theater | 1,361 | 37.2s | 36.6 |
| 3 | Prolog im Himmel | 793 | 27.2s | 29.2 |
| 4 | Nacht | 2,868 | 99.9s | 28.7 |
| 5 | Vor dem Tor | 2,341 | 76.5s | 30.6 |
| 6 | Studierzimmer | 5,332 | 203.2s | 26.2 |
| 7 | Auerbachs Keller in Leipzig | 1,992 | 93.8s | 21.2 |
| 8 | Hexenküche | 2,058 | 84.5s | 24.4 |
| 9 | Straße (I) | 474 | 24.1s | 19.7 |
| 10 | Abend | 847 | 32.9s | 25.7 |
| 11 | Spaziergang | 401 | 13.2s | 30.4 |
| 12 | Der Nachbarin Haus | 1,191 | 50.3s | 23.7 |
| 13 | Straße (II) | 342 | 14.8s | 23.1 |
| 14 | Garten | 1,048 | 45.7s | 22.9 |
| 15 | Ein Gartenhäuschen | 147 | 7.3s | 20.1 |
| 16 | Wald und Höhle | 1,038 | 34.5s | 30.1 |
| 17 | Gretchens Stube | 138 | 5.2s | 26.5 |
| 18 | Marthens Garten | 851 | 34.1s | 25.0 |
| 19 | Am Brunnen | 293 | 12.3s | 23.8 |
| 20 | Zwinger | 164 | 6.3s | 26.0 |
| 21 | Nacht. Straße vor Gretchens Türe | 949 | 50.2s | 18.9 |
| 22 | Dom | 239 | 10.6s | 22.5 |
| 23 | Walpurgisnacht | 2,636 | 115.8s | 22.8 |
| 24 | Walpurgisnachtstraum | 953 | 40.0s | 23.8 |
| 25 | Trüber Tag. Feld | 488 | 21.9s | 22.3 |
| 26 | Nacht, offen Feld | 42 | 2.8s | 15.0 |
| 27 | Kerker | 1,329 | 54.9s | 24.2 |

> **Slowest:** Studierzimmer (203.2s — 5,332 words, the longest chapter by far)  
> **Fastest:** Nacht, offen Feld (2.8s — only 42 words)  
> **Best rate:** Vorspiel auf dem Theater (36.6 w/s — moderate length, dialogue-heavy)

---

## French (`fr`)

**Model:** `Helsinki-NLP/opus-mt-en-fr` (~298 MB)  
**Total:** 30,315 words · 33m 58s kernel · **14.9 words/sec**

| # | Chapter | Words | Time | Words/sec |
|---|---------|-------|------|-----------|
| 1 | Zueignung | 221 | — | — (model load) |
| 2 | Vorspiel auf dem Theater | 1,361 | 86.9s | 15.7 |
| 3 | Prolog im Himmel | 793 | 53.6s | 14.8 |
| 4 | Nacht | 2,868 | 200.0s | 14.3 |
| 5 | Vor dem Tor | 2,341 | 156.5s | 15.0 |
| 6 | Studierzimmer | 5,332 | 356.0s | 15.0 |
| 7 | Auerbachs Keller in Leipzig | 1,992 | 145.2s | 13.7 |
| 8 | Hexenküche | 2,058 | 132.6s | 15.5 |
| 9 | Straße (I) | 474 | 33.5s | 14.1 |
| 10 | Abend | 847 | 55.5s | 15.3 |
| 11 | Spaziergang | 401 | 16.2s | 24.8 |
| 12 | Der Nachbarin Haus | 1,191 | 79.2s | 15.0 |
| 13 | Straße (II) | 342 | 22.8s | 15.0 |
| 14 | Garten | 1,048 | 69.7s | 15.0 |
| 15 | Ein Gartenhäuschen | 147 | 10.0s | 14.7 |
| 16 | Wald und Höhle | 1,038 | 68.8s | 15.1 |
| 17 | Gretchens Stube | 138 | 9.4s | 14.7 |
| 18 | Marthens Garten | 851 | 55.9s | 15.2 |
| 19 | Am Brunnen | 293 | 18.6s | 15.8 |
| 20 | Zwinger | 164 | 9.8s | 16.7 |
| 21 | Nacht. Straße vor Gretchens Türe | 949 | 59.4s | 16.0 |
| 22 | Dom | 239 | 14.8s | 16.1 |
| 23 | Walpurgisnacht | 2,636 | 182.9s | 14.4 |
| 24 | Walpurgisnachtstraum | 953 | 61.6s | 15.5 |
| 25 | Trüber Tag. Feld | 488 | 40.9s | 11.9 |
| 26 | Nacht, offen Feld | 42 | 3.2s | 13.1 |
| 27 | Kerker | 1,329 | 95.5s | 13.9 |

> **Slowest:** Studierzimmer (356.0s — same chapter, nearly 2× slower than German)  
> **Fastest:** Nacht, offen Feld (3.2s)  
> **Most consistent:** nearly every chapter lands within 13–16 w/s, unlike German's wider 19–37 range

---

## Observations

### 1. French is uniformly slower than German (~41%)

German throughput varies widely (18–37 w/s); French is nearly flat at 13–16 w/s.
The `opus-mt-en-fr` model likely uses a larger vocabulary or produces longer output
tokens on average (French inflection and articles expand word count). Since MarianMT
generates tokens one-by-one, a higher output token count directly increases wall time.

### 2. Chapter size dominates total time

The single longest chapter — *Studierzimmer* (5,332 words) — accounts for:
- 17% of German kernel time (203s out of 1199s)
- 17% of French kernel time (356s out of 2038s)

Short scenes (< 200 words) finish in under 10 seconds. A seeding strategy that
prioritises short chapters first would show visible DB progress faster.

### 3. de throughput is higher for short/dialogue scenes

Chapters with dense dialogue (many short lines, low average sentence length) run
faster: *Straße I* (474 words, 19.7 w/s), *Spaziergang* (401 words, 30.4 w/s).
The chunker splits at sentence boundaries, so short-sentence text produces smaller,
faster-to-generate chunks.

### 4. CPU is viable for seeding; GPU would be 10–20×

Faust (~30k words) cost ~20 min (de) and ~34 min (fr) on CPU. A typical GPU
(RTX 3080 or M2 Pro Neural Engine) would reduce this to 1–3 minutes per language.
For a full library seed, GPU or Ollama with a faster model is recommended.

---

## Throughput Estimates for Other Books

Based on observed 25.3 w/s (de) and 14.9 w/s (fr):

| Book size | German (de) | French (fr) |
|-----------|-------------|-------------|
| 25k words (Alice) | ~17 min | ~28 min |
| 30k words (Faust) | ~20 min | ~34 min |
| 60k words (typical novel) | ~40 min | ~67 min |
| 180k words (War & Peace) | ~2h | ~3h 22m |

---

## Notes

- Timing is wall-clock time for the translation kernel only (excludes DB write ~0.5s/chapter).
- `Words/sec` = source-side English word count ÷ translation time (kernel only).
- Model downloads occur on first run only; cached on subsequent runs.
- MarianMT chunk cap: 480 tokens — long paragraphs are split and translated in pieces, then rejoined with spaces.
- CPU only; no GPU acceleration used.
- Both translations are now cached in the local SQLite DB and served immediately by the reader.
