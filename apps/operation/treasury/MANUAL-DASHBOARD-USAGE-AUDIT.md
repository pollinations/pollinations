# Manual dashboard usage audit: OVH, Lambda, IO.NET

Date prepared: 2026-07-08

This note captures the provider usage that was reconstructed manually from dashboards, screenshots, and invoices. It is intended as audit support for the 2026 spend reconstruction.

Important accounting note: currencies are kept separate. OVH invoices are in EUR and were offset by OVH vouchers, so invoice totals paid were EUR 0.00 even though resource usage was billed internally. Lambda is in USD. IO.NET is shown as USDC in the dashboard.

## Source material

| Provider | Source | Local evidence |
|---|---|---|
| OVH | PDF invoices with text layer | `_local/2026-07-01-spend-audit/ovh/Invoice_IE*.pdf` |
| Lambda | Manual dashboard screenshots shared on 2026-07-08 | Chat attachment, copied into this note manually |
| IO.NET | Dashboard screenshots | `_local/2026-07-01-spend-audit/io.net/*.png` |

## Classification rules

| Bucket | Rule |
|---|---|
| Serverless Inference AI for Media generation | OVH `AI Endpoints` token and audio processing lines, including `gpt-oss-20b`, `Qwen3-Coder-30B`, `Mistral-Small-3.2`, and `whisper-large-v3` |
| GPU | Hourly GPU instances and GPU rentals, including OVH `rtx5000-84`, OVH `t2-le-90`, Lambda GPU instances, and IO.NET GPU clusters |
| Infrastructure | Non-GPU hosting and storage: OVH `legacy-gateway` b3 instances, additional disks, and Public Cloud snapshots |

## Monthly summary

OVH is EUR usage before voucher offsets. Lambda is USD spend. IO.NET is USDC paid amount visible in dashboard detail screenshots.

| Month | OVH Serverless Inference AI | OVH GPU | OVH Infrastructure | Lambda GPU | IO.NET GPU | Notes |
|---|---:|---:|---:|---:|---:|---|
| Jan 2026 | EUR 684.20 | EUR 1,856.80 | EUR 1.75 | USD 0.00 | USDC 1,929.60 | IO.NET includes visible Jan-ending RTX 4090 deployments; some started 2025-12-29 |
| Feb 2026 | EUR 624.33 | EUR 224.64 | EUR 47.83 | USD 0.00 | USDC 384.00 | IO.NET visible L40 deployment ended 2026-02-01 |
| Mar 2026 | EUR 711.01 | EUR 0.00 | EUR 55.80 | USD 4.96 | USDC 0.00 | Lambda GH200 partial-month usage |
| Apr 2026 | EUR 1,002.43 | EUR 0.00 | EUR 57.38 | USD 2,217.65 | USDC 0.00 | Lambda GH200, A100 SXM4, and A10 |
| May 2026 | EUR 962.32 | EUR 0.00 | EUR 59.29 | USD 1,703.76 | USDC 0.00 | Lambda GH200 full month |
| Jun 2026 | EUR 0.00 | EUR 0.00 | EUR 0.00 | USD 1,648.80 | USDC 0.00 | No OVH June usage invoice in current folder; Lambda GH200 full month |
| Jul 2026 through 2026-07-08 16:38 UTC | EUR 0.00 | EUR 0.00 | EUR 0.00 | USD 579.92 | USDC 0.00 | Lambda partial month as shown in dashboard |

## OVH detail

OVH invoice issue dates are one month after the usage period. For example, invoices issued on 2026-06-01 represent May 2026 usage. All listed OVH invoice totals were EUR 0.00 because usage was offset by voucher credits.

| Usage month | Invoice references | Serverless Inference AI | GPU | Infrastructure | Total resource usage |
|---|---|---:|---:|---:|---:|
| Jan 2026 | `IE1971296` | EUR 684.20 | EUR 1,856.80 | EUR 1.75 | EUR 2,542.75 |
| Feb 2026 | `IE1997411`, `IE1997416` | EUR 624.33 | EUR 224.64 | EUR 47.83 | EUR 896.80 |
| Mar 2026 | `IE2020103`, `IE2020109` | EUR 711.01 | EUR 0.00 | EUR 55.80 | EUR 766.81 |
| Apr 2026 | `IE2042526`, `IE2042548` | EUR 1,002.43 | EUR 0.00 | EUR 57.38 | EUR 1,059.81 |
| May 2026 | `IE2065346`, `IE2065657` | EUR 962.32 | EUR 0.00 | EUR 59.29 | EUR 1,021.61 |

OVH line classification:

| Invoice line family | Bucket |
|---|---|
| `Amount of input tokens for AI Endpoints ...` | Serverless Inference AI for Media generation |
| `Amount of output tokens for AI Endpoints ...` | Serverless Inference AI for Media generation |
| `Duration of data processed by AI Endpoints whisper-large-v3 model` | Serverless Inference AI for Media generation |
| `Hourly consumption for rtx5000-84 gra9 instances` | GPU |
| `Hourly consumption for t2-le-90 de1 instances` | GPU |
| `Hourly consumption for t2-le-90 uk1 instances` | GPU |
| `Hourly consumption for b3-8 eu-west-par instances` | Infrastructure |
| `Additional disks in eu-west-par` | Infrastructure |
| `Public Cloud Snapshots` | Infrastructure |

## Lambda detail

Lambda data was copied manually from dashboard screenshots. July values are partial through 2026-07-08 16:38 UTC.

| Month | Name | Type | Region | Duration | Usage | Rate | Spend |
|---|---|---|---|---|---:|---:|---:|
| Mar 2026 | Sana - LTX-2.3 - AceStep | `gpu_1x_gh200` | Washington DC, USA | 2026-03-31 21:30 UTC to 2026-04-01 00:00 UTC | 2.50 hr | USD 1.99/hr | USD 4.96 |
| Apr 2026 | Sana - LTX-2.3 - AceStep | `gpu_1x_gh200` | Washington DC, USA | 2026-04-01 00:00 UTC to 2026-05-01 00:00 UTC | 720.00 hr | Varied | USD 1,612.80 |
| Apr 2026 | Sana | `gpu_1x_a100_sxm4` | Virginia, USA | 2026-04-04 07:57 UTC to 2026-04-12 12:12 UTC | 196.24 hr | Varied | USD 370.10 |
| Apr 2026 | Sana | `gpu_1x_a10` | Virginia, USA | 2026-04-04 07:55 UTC to 2026-04-12 11:16 UTC | 195.35 hr | Varied | USD 234.75 |
| May 2026 | Sana - LTX-2.3 - AceStep | `gpu_1x_gh200` | Washington DC, USA | 2026-05-01 00:00 UTC to 2026-06-01 00:00 UTC | 744.00 hr | USD 2.29/hr | USD 1,703.76 |
| Jun 2026 | Sana - LTX-2.3 - AceStep | `gpu_1x_gh200` | Washington DC, USA | 2026-06-01 00:00 UTC to 2026-07-01 00:00 UTC | 720.00 hr | USD 2.29/hr | USD 1,648.80 |
| Jul 2026 | bonsai | `gpu_1x_a10` | California, USA | 2026-07-03 14:50 UTC to 2026-07-08 16:38 UTC | 121.80 hr | USD 1.29/hr | USD 157.11 |
| Jul 2026 | Sana - LTX-2.3 - AceStep | `gpu_1x_gh200` | Washington DC, USA | 2026-07-01 00:00 UTC to 2026-07-08 16:38 UTC | 184.64 hr | USD 2.29/hr | USD 422.81 |

Lambda monthly totals:

| Month | GPU spend |
|---|---:|
| Mar 2026 | USD 4.96 |
| Apr 2026 | USD 2,217.65 |
| May 2026 | USD 1,703.76 |
| Jun 2026 | USD 1,648.80 |
| Jul 2026 through 2026-07-08 16:38 UTC | USD 579.92 |

Lambda April variable-rate detail visible in the dashboard:

| Instance | Period | Usage | Rate | Spend |
|---|---|---:|---:|---:|
| `gpu_1x_gh200` | 2026-04-01 00:00 UTC to 2026-04-06 00:00 UTC | 120.0 hr | USD 1.99/hr | USD 238.80 |
| `gpu_1x_gh200` | 2026-04-06 00:00 UTC to 2026-05-01 00:00 UTC | 600.0 hr | USD 2.29/hr | USD 1,374.00 |
| `gpu_1x_a100_sxm4` | 2026-04-04 07:57 UTC to 2026-04-06 00:00 UTC | 40.04 hr | USD 1.48/hr | USD 59.25 |
| `gpu_1x_a100_sxm4` | 2026-04-06 00:00 UTC to 2026-04-12 12:12 UTC | 156.21 hr | USD 1.99/hr | USD 310.85 |
| `gpu_1x_a10` | 2026-04-04 07:55 UTC to 2026-04-06 00:00 UTC | 40.08 hr | USD 0.86/hr | USD 34.46 |
| `gpu_1x_a10` | 2026-04-06 00:00 UTC to 2026-04-12 11:16 UTC | 155.27 hr | USD 1.29/hr | USD 200.29 |

## IO.NET detail

IO.NET data was reconstructed from dashboard screenshots in `_local/2026-07-01-spend-audit/io.net`. The screenshots cover visible deployment detail pages mostly around late December 2025 through 2026-02-01. They do not establish IO.NET activity for March through July 2026.

The dashboard showed paid amounts in USDC. For RTX 4090 deployments, the implied rate was consistently about USDC 0.30 per GPU-hour. The L40 deployment implied USDC 1.00 per GPU-hour.

| Deployment | GPU | GPUs | VMs | Started UTC | Ended UTC | Served shown | Paid | Implied GPU-hour |
|---|---|---:|---:|---|---|---:|---:|---:|
| `vmaas-6acf35ab` | RTX 4090 | 2 | 1 | 2025-12-29 15:49:41 | 2026-01-12 15:54:05 | 336 hr | USDC 201.60 | USDC 0.30 |
| `vmaas-e2c905fc` | RTX 4090 | 2 | 1 | 2025-12-29 15:51:33 | 2026-01-12 15:56:08 | 336 hr | USDC 201.60 | USDC 0.30 |
| `vmaas-b72b6c49` | RTX 4090 | 2 | 1 | 2025-12-29 15:52:19 | 2026-01-25 15:56:43 | 647 hr 50 min | USDC 388.80 | about USDC 0.30 |
| `vmaas-688fd0dc` | RTX 4090 | 2 | 1 | 2025-12-29 15:52:53 | 2026-01-25 15:59:29 | 647 hr 50 min | USDC 388.80 | about USDC 0.30 |
| `vmaas-41a7d908` | RTX 4090 | 2 | 1 | 2025-12-29 15:53:40 | 2026-01-25 16:00:14 | 647 hr 50 min | USDC 388.80 | about USDC 0.30 |
| `vmaas-22e58f05` | RTX 4090 | 2 | 1 | 2026-01-19 18:20:57 | 2026-02-01 18:23:13 | 312 hr | USDC 187.20 | USDC 0.30 |
| `vmaas-41e2e564` | RTX 4090 | 2 | 1 | 2026-01-25 19:01:57 | 2026-01-29 19:06:23 | 96 hr | USDC 57.60 | USDC 0.30 |
| `vmaas-46665737` | RTX 4090 | 2 | 1 | 2026-01-25 19:03:16 | 2026-01-29 19:09:40 | 96 hr | USDC 57.60 | USDC 0.30 |
| `vmaas-8afc966b` | RTX 4090 | 2 | 1 | 2026-01-25 19:04:12 | 2026-01-29 19:10:35 | 96 hr | USDC 57.60 | USDC 0.30 |
| `vmaas-d24ab335` | L40 | 8 | 1 | 2026-01-30 11:04:25 | 2026-02-01 11:04:30 | 48 hr | USDC 384.00 | USDC 1.00 |

IO.NET visible deployment totals:

| Period represented by visible detail pages | GPU spend |
|---|---:|
| Deployments ending in Jan 2026 | USDC 1,929.60 |
| Deployment ending on 2026-02-01 | USDC 384.00 |
| Total visible IO.NET deployment detail | USDC 2,313.60 |

## Gaps and caveats

1. OVH is complete for the invoices present in the folder: Jan-May 2026 usage.
2. Lambda is complete only for the dashboard screenshots provided in chat: Mar-Jul 2026 through 2026-07-08 16:38 UTC.
3. IO.NET screenshots are enough to reconstruct the visible late-2025 through early-2026 deployments, but they do not show evidence of March-July IO.NET usage.
4. IO.NET transaction-list screenshots include booking, extension, refund, reload, and credit-expiry rows. They are useful for reconciliation, but OCR was noisy; transaction IDs should be manually verified from the screenshots before being treated as final accounting records.
5. Provider totals should not be summed across currencies unless an explicit FX policy is chosen.
