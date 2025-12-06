import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ReportingService } from '../services/ReportingService';
import { 
  ReportImageData, 
  ReportReason, 
  REPORT_REASONS 
} from '../types/reporting';

interface ReportImageModalProps {
  visible: boolean;
  onClose: () => void;
  imageId: string;
  imageUrl: string;
  source: 'lexica' | 'civitai';
  prompt?: string;
}

export default function ReportImageModal({
  visible,
  onClose,
  imageId,
  imageUrl,
  source,
  prompt
}: ReportImageModalProps) {
  const { theme } = useTheme();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [userComment, setUserComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (loading) return;
    setSelectedReason(null);
    setUserComment('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for reporting this image.');
      return;
    }

    try {
      setLoading(true);
      const reportData: ReportImageData = {
        imageId,
        imageUrl,
        source,
        prompt,
        reason: selectedReason,
        userComment: userComment.trim() || undefined,
        deviceInfo: ReportingService.getDeviceInfo()
      };


      const validationError = ReportingService.validateReportData(reportData);
      if (validationError) {
        Alert.alert('Error', validationError);
        return;
      }

      const result = await ReportingService.reportImage(reportData);

      if (result.success) {
        Alert.alert(
          'Report Sent',
          'Thank you for your report. Our team will review this content and take appropriate action.',
          [{ text: 'OK', onPress: handleClose }]
        );
      } else {
        Alert.alert(
          'Report Saved',
          'Your report has been saved and will be processed as soon as possible. Thank you for helping us maintain a safe community.',
          [{ text: 'OK', onPress: handleClose }]
        );
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert(
        'Error',
        'Failed to submit report. Please try again later.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const renderReasonOption = (reason: typeof REPORT_REASONS[number]) => (
    <TouchableOpacity
      key={reason.id}
      style={[
        styles.reasonOption,
        { 
          backgroundColor: theme.colors.card, 
          borderColor: selectedReason === reason.id ? theme.colors.primary : theme.colors.border 
        },
        selectedReason === reason.id && styles.selectedReasonOption
      ]}
      onPress={() => setSelectedReason(reason.id)}
      disabled={loading}
    >
      <View style={styles.reasonContent}>
        <View style={styles.reasonHeader}>
          <Text style={[
            styles.reasonTitle, 
            { color: theme.colors.text }
          ]}>
            {reason.label}
          </Text>
          {selectedReason === reason.id && (
            <Ionicons 
              name="checkmark-circle" 
              size={20} 
              color={theme.colors.primary} 
            />
          )}
        </View>
        <Text style={[
          styles.reasonDescription, 
          { color: theme.colors.textSecondary }
        ]}>
          {reason.description}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[
          styles.header, 
          { 
            backgroundColor: theme.colors.headerBackground, 
            borderBottomColor: theme.colors.border 
          }
        ]}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Report Image
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              Help us maintain a safe community
            </Text>
          </View>
          
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Image Info */}
          <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="image-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Image Information
              </Text>
            </View>
            
            <View style={styles.imageInfo}>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                Source:
              </Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </Text>
            </View>
            
            <View style={styles.imageInfo}>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                Image ID:
              </Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]} numberOfLines={1}>
                {imageId}
              </Text>
            </View>
            
            {prompt && (
              <View style={styles.imageInfo}>
                <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                  Prompt:
                </Text>
                <Text style={[styles.infoValue, { color: theme.colors.text }]} numberOfLines={3}>
                  {prompt}
                </Text>
              </View>
            )}
          </View>

          {/* Report Reason */}
          <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flag-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Why are you reporting this image?
              </Text>
            </View>
            
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Please select the most appropriate reason for your report:
            </Text>

            <View style={styles.reasonsList}>
              {REPORT_REASONS.map(renderReasonOption)}
            </View>
          </View>

          {/* Additional Comments */}
          <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="chatbubble-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                Additional Comments (Optional)
              </Text>
            </View>
            
            <Text style={[styles.sectionDescription, { color: theme.colors.textSecondary }]}>
              Provide any additional details that might help us review this content:
            </Text>

            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: theme.colors.inputBackground,
                  borderColor: theme.colors.inputBorder,
                  color: theme.colors.text
                }
              ]}
              value={userComment}
              onChangeText={setUserComment}
              placeholder="Optional: Add any additional context..."
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
              editable={!loading}
            />
            
            <Text style={[styles.characterCount, { color: theme.colors.textSecondary }]}>
              {userComment.length}/500 characters
            </Text>
          </View>

          {/* Disclaimer */}
          <View style={[styles.disclaimer, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.warning} />
            <Text style={[styles.disclaimerText, { color: theme.colors.text }]}>
              False reports may result in restrictions on your account. 
              Please only report content that genuinely violates our community guidelines.
            </Text>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={[styles.footer, { backgroundColor: theme.colors.headerBackground, borderTopColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              { 
                backgroundColor: selectedReason && !loading ? theme.colors.error : theme.colors.textTertiary 
              }
            ]}
            onPress={handleSubmit}
            disabled={!selectedReason || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flag" size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  imageInfo: {
    maxHeight:50,
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 80,
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
    flex: 1,
  },
  reasonsList: {
    gap: 12,
  },
  reasonOption: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
  },
  selectedReasonOption: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reasonContent: {
    gap: 8,
  },
  reasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  reasonDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  commentInput: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 100,
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    textAlign: 'right',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});