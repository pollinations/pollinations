package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultEnterURL = "https://enter.pollinations.ai"
	deviceClientID  = "pk_nDXh3ryXfjTkirMB"
	deviceScope     = "profile usage"
)

type credentials struct {
	APIKey  string `json:"apiKey,omitempty"`
	KeyType string `json:"keyType,omitempty"`
}

type deviceCodeResponse struct {
	DeviceCode              string `json:"device_code"`
	UserCode                string `json:"user_code"`
	VerificationURI         string `json:"verification_uri"`
	VerificationURIComplete string `json:"verification_uri_complete"`
	ExpiresIn               int    `json:"expires_in"`
	Interval                int    `json:"interval"`
}

type deviceTokenResponse struct {
	AccessToken      string `json:"access_token"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func storedAPIKey() string {
	if key := firstEnv("POLLINATIONS_API_KEY", "SIRIUS_API_KEY", "ENTER_API_TOKEN_LOCAL", "ENTER_API_TOKEN_REMOTE"); key != "" {
		return key
	}

	raw, err := os.ReadFile(credentialsFile())
	if err != nil {
		return ""
	}

	var creds credentials
	if err := json.Unmarshal(raw, &creds); err != nil {
		return ""
	}
	return strings.TrimSpace(creds.APIKey)
}

func saveAPIKey(key string) error {
	path := credentialsFile()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	keyType := "pk"
	if strings.HasPrefix(key, "sk_") {
		keyType = "sk"
	}

	raw, err := json.MarshalIndent(credentials{APIKey: key, KeyType: keyType}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}

func credentialsFile() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".pollinations/credentials.json"
	}
	return filepath.Join(home, ".pollinations", "credentials.json")
}

func requestDeviceCode(client apiClient) (deviceCodeResponse, error) {
	payload, err := json.Marshal(map[string]string{
		"client_id": deviceClientID,
		"scope":     deviceScope,
	})
	if err != nil {
		return deviceCodeResponse{}, err
	}

	req, err := http.NewRequest(http.MethodPost, client.enterURL+"/api/device/code", bytes.NewReader(payload))
	if err != nil {
		return deviceCodeResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := client.http.Do(req)
	if err != nil {
		return deviceCodeResponse{}, err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return deviceCodeResponse{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return deviceCodeResponse{}, fmt.Errorf("device code request failed: HTTP %d: %s", res.StatusCode, extractDetail(raw))
	}

	var decoded deviceCodeResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return deviceCodeResponse{}, err
	}
	if decoded.DeviceCode == "" || decoded.UserCode == "" {
		return deviceCodeResponse{}, errors.New("device code response was incomplete")
	}
	return decoded, nil
}

func pollDeviceToken(client apiClient, code deviceCodeResponse) (string, error) {
	deadline := time.Now().Add(time.Duration(code.ExpiresIn) * time.Second)
	interval := time.Duration(max(code.Interval, 5)) * time.Second

	for time.Now().Before(deadline) {
		time.Sleep(interval)

		payload, err := json.Marshal(map[string]string{
			"device_code": code.DeviceCode,
			"client_id":   deviceClientID,
			"grant_type":  "urn:ietf:params:oauth:grant-type:device_code",
		})
		if err != nil {
			return "", err
		}

		req, err := http.NewRequest(http.MethodPost, client.enterURL+"/api/device/token", bytes.NewReader(payload))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")

		res, err := client.http.Do(req)
		if err != nil {
			return "", err
		}

		raw, readErr := io.ReadAll(res.Body)
		res.Body.Close()
		if readErr != nil {
			return "", readErr
		}

		var decoded deviceTokenResponse
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return "", err
		}
		if res.StatusCode >= 200 && res.StatusCode < 300 && decoded.AccessToken != "" {
			if err := saveAPIKey(decoded.AccessToken); err != nil {
				return "", err
			}
			return decoded.AccessToken, nil
		}
		if decoded.Error == "authorization_pending" || decoded.Error == "slow_down" {
			continue
		}
		if decoded.ErrorDescription != "" {
			return "", errors.New(decoded.ErrorDescription)
		}
		if decoded.Error != "" {
			return "", errors.New(decoded.Error)
		}
		return "", fmt.Errorf("device token request failed: HTTP %d", res.StatusCode)
	}

	return "", errors.New("device code expired")
}
