import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import VersionService from '../services/VersionService'
import { VersionCheckResult } from '../types/version';

interface VersionCheckerProps {
  children: React.ReactNode;
  packageName?: string;
  checkOnEveryRender?: boolean;
  forceUpdate?: boolean;
}

export default function VersionChecker({ 
  children, 
  packageName = 'com.ismafly.promptexploratorapp',
  checkOnEveryRender = false,
  forceUpdate = true
}: VersionCheckerProps) {
  const { theme } = useTheme();
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!checkOnEveryRender && hasChecked) return;
    
    checkVersion();
  }, [checkOnEveryRender, hasChecked]);

  const checkVersion = async () => {
    setIsChecking(true);
    
    try {
      const result = await VersionService.checkForUpdate();
      setVersionCheck(result);
      setHasChecked(true);
      
      if (result.needsUpdate) {
        setShowUpdateModal(true);
      }
    } catch (error) {
      console.error('Erreur vérification version:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdate = () => {
    VersionService.openPlayStore(packageName);
  };

  const handleSkipUpdate = () => {
    Alert.alert(
      'Update Required',
      'This version is no longer supported. You must update the app to continue.',
      [
        {
          text: 'Update Now',
          onPress: handleUpdate,
        },
      ]
    );
  };


  if (isChecking && !hasChecked) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.text }]}>
          Checking for updates...
        </Text>
      </View>
    );
  }

  return (
    <>
      {children}
      
      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              {forceUpdate ? 'Update Required' : 'Update Available'}
            </Text>
            
            <Text style={[styles.modalMessage, { color: theme.colors.textSecondary }]}>
              A new version ({versionCheck?.latestVersion}) is available.
              {'\n'}Current version: {versionCheck?.currentVersion}
            </Text>

            <Text style={[styles.modalDescription, { color: theme.colors.textSecondary }]}>
              {forceUpdate 
                ? 'This version is no longer supported. You must update to continue using the app.'
                : 'To enjoy the latest features and bug fixes, we recommend updating the app.'
              }
            </Text>

            <View style={styles.modalButtons}>
              {!forceUpdate && (
                <TouchableOpacity
                  style={[styles.skipButton, { borderColor: theme.colors.border }]}
                  onPress={handleSkipUpdate}
                >
                  <Text style={[styles.skipButtonText, { color: theme.colors.textSecondary }]}>
                    Later
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.updateButton, 
                  { backgroundColor: theme.colors.primary },
                  forceUpdate && styles.fullWidthButton
                ]}
                onPress={handleUpdate}
              >
                <Text style={styles.updateButtonText}>
                  Update Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  modalDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  updateButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  fullWidthButton: {
    flex: 0,
    width: '100%',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});