# Token Rotation Deployment Checklist (PR #7807)

Security hardening following Jan 28-29 token compromise. This checklist tracks all deployment steps.

## ⚠️ Downtime Risk Considerations

| Component | Risk | Mitigation |
|-----------|------|------------|
| **GitHub CI** | CI will fail if `SOPS_AGE_KEY` not updated before merge | Update secret BEFORE merge |
| **Modal Flux Klein** | Cold start required - existing containers won't have new token | Redeploy immediately after merge |
| **io.net instances** | Manual SSH required - services will reject requests until updated | Update all 4 instances promptly |
| **EC2 services** | Automatic via CI - brief restart during deploy | Monitor health endpoints |

**Recommended order**: Pre-merge secrets → Merge → Modal redeploy → io.net updates → Verify

---

## Pre-Merge Requirements (CRITICAL - DO THESE FIRST)

- [ ] **Update GitHub Secret `SOPS_AGE_KEY`**
  ```bash
  # Get new age private key from secure storage, then:
  gh secret set SOPS_AGE_KEY --repo pollinations/pollinations
  ```
  New public key: `age1k85e3hjd2tv3wtjv7npjtmp9pwr5cfda22hyz9ajg06uqel3cc5s6c34rd`

- [ ] **Create Modal `backend-token` secret**
  ```bash
  # Get PLN_IMAGE_BACKEND_TOKEN from SOPS secrets:
  export SOPS_AGE_KEY=$(security find-generic-password -a "$USER" -s "sops-age-key" -w)
  TOKEN=$(sops -d image.pollinations.ai/secrets/env.json | jq -r '.PLN_IMAGE_BACKEND_TOKEN')
  
  # Create Modal secret:
  modal secret create backend-token PLN_IMAGE_BACKEND_TOKEN="$TOKEN"
  ```

## Merge & Deploy

- [ ] **Merge PR #7807**
  ```bash
  gh pr merge 7807 --squash
  ```

- [ ] **Deploy to staging**
  ```bash
  git checkout staging && git merge main && git push
  ```
  Wait for CI to complete.

- [ ] **Verify staging**
  - [ ] Text service health: `curl https://staging-text.pollinations.ai/health`
  - [ ] Image service health: `curl https://staging-image.pollinations.ai/health`

- [ ] **Deploy to production**
  ```bash
  git checkout production && git merge main && git push
  ```

## Post-Merge: Modal Deployment (DO IMMEDIATELY)

> ⚠️ **Flux Klein will be DOWN** until these are redeployed. Existing Modal containers have the old `enter-token` secret and won't accept the new `x-backend-token` header.

- [ ] **Redeploy Flux Klein 4B**
  ```bash
  cd image.pollinations.ai/image_gen_flux_klein
  modal deploy flux_klein.py
  ```

- [ ] **Redeploy Flux Klein 9B**
  ```bash
  modal deploy flux_klein_9b.py
  ```

- [ ] **Verify Modal endpoints respond**
  ```bash
  # Test direct Modal endpoint (should return image or auth error, not 500)
  curl -I "https://myceli-ai--flux-klein-fluxklein-generate-web.modal.run?prompt=test"
  ```

## Post-Merge: io.net Instances (DO PROMPTLY)

> ⚠️ **Z-Image and Nunchaku/Flux on io.net will reject requests** until manually updated. These require SSH access.

For each io.net instance, SSH in and update:

### Z-Image Instances
- [ ] **Z-Image Worker 1** (54.185.175.109:20033)
  ```bash
  ssh -p 20033 ionet@54.185.175.109
  PLN_IMAGE_BACKEND_TOKEN=xxx GPU0_PUBLIC_PORT=24602 GPU1_PUBLIC_PORT=25962 bash ~/pollinations/image.pollinations.ai/z-image/setup-ionet.sh
  ```

- [ ] **Z-Image Worker 2** (54.185.175.109:28816)
  ```bash
  ssh -p 28816 ionet@54.185.175.109
  PLN_IMAGE_BACKEND_TOKEN=xxx GPU0_PUBLIC_PORT=xxx GPU1_PUBLIC_PORT=xxx bash ~/pollinations/image.pollinations.ai/z-image/setup-ionet.sh
  ```

### Nunchaku/Flux Instances
- [ ] **Flux Worker 1** (3.21.229.114:23655)
  ```bash
  ssh -p 23655 ionet@3.21.229.114
  # Update .env and restart
  echo "PLN_IMAGE_BACKEND_TOKEN=xxx" > $HOME/.env
  sudo systemctl restart ionet-flux-worker*
  ```

- [ ] **Flux Worker 2** (3.21.229.114:24671)
  ```bash
  ssh -p 24671 ionet@3.21.229.114
  echo "PLN_IMAGE_BACKEND_TOKEN=xxx" > $HOME/.env
  sudo systemctl restart ionet-flux-worker*
  ```

## Verification (Final Checks)

- [ ] **EC2 services responding**
  ```bash
  curl -s https://text.pollinations.ai/health
  curl -s https://image.pollinations.ai/health
  ```

- [ ] **Image generation works end-to-end**
  ```bash
  curl "https://image.pollinations.ai/prompt/test%20cat?model=flux" -o test.png
  ```

- [ ] **Flux Klein works (Modal)**
  ```bash
  curl "https://image.pollinations.ai/prompt/test%20dog?model=flux-klein" -o test-klein.png
  ```

- [ ] **Z-Image works (io.net)**
  ```bash
  curl "https://image.pollinations.ai/prompt/test%20bird?model=turbo" -o test-turbo.png
  ```

- [ ] **No auth errors in logs**
  ```bash
  # Check EC2 image service logs for "Invalid or missing backend token" errors
  ssh ubuntu@<EC2_HOST> "sudo journalctl -u image-pollinations -n 50 | grep -i token"
  ```

## Token Architecture Reference

| Flow | Token | Header | Location |
|------|-------|--------|----------|
| enter → EC2 | `PLN_ENTER_TOKEN` | `x-enter-token` | SOPS secrets, Wrangler |
| EC2 → io.net | `PLN_IMAGE_BACKEND_TOKEN` | `x-backend-token` | `$HOME/.env` on io.net |
| EC2 → Modal | `PLN_IMAGE_BACKEND_TOKEN` | `x-backend-token` | Modal `backend-token` secret |

## Rotation Scripts

For future token rotations:

```bash
# Rotate PLN_ENTER_TOKEN (enter → EC2)
./scripts/rotate-enter-token.sh

# Rotate PLN_IMAGE_BACKEND_TOKEN (EC2 → backends)
./scripts/rotate-backend-token.sh
```

---

**PR**: https://github.com/pollinations/pollinations/pull/7807
**Branch**: `security/token-rotation-clean`
