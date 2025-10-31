import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { RootStackScreenProps } from '../navigation/types';
import { useTheme } from '../context/ThemeContext';
import { OptimizedImage } from '../components/OptimizedImage';
import { pollinationsService } from '../services/PollinationsService';
import ImagePreparationService from '../services/ImagePreparationService';
import TransformationService from '../services/TransformationService';
import { TransformationStatus, TransformationVersion } from '../types/transformation';

export default function EditScreen({ navigation, route }: RootStackScreenProps<'EditScreen'>) {
  const { theme } = useTheme();
  const { selectedImages, chainId } = route.params;

  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<TransformationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState<string | undefined>(chainId);

  const model = ImagePreparationService.determineModel(selectedImages.length);
  const modelName = model === 'kontext' ? 'Kontext' : 'GPTImage';

  useEffect(() => {
    console.log('EditScreen mounted with:', {
      imagesCount: selectedImages.length,
      model,
      chainId: currentChainId,
    });
  }, []);

  const handleTransform = async () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a transformation prompt');
      return;
    }

    if (!model) {
      Alert.alert('Error', 'Invalid number of images selected');
      return;
    }

    try {
      setStatus('preparing');
      setError(null);

      // Validation
      const validation = ImagePreparationService.validateSelection(selectedImages);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      setStatus('uploading');
      const prepResult = await ImagePreparationService.prepareImagesForTransformation(selectedImages);
      
      if (!prepResult.success || !prepResult.imageUrls) {
        throw new Error(prepResult.error || 'Failed to prepare images');
      }

      // Transformation
      setStatus('transforming');
      const transformResult = await pollinationsService.transformImages({
        prompt: prompt.trim(),
        model,
        imageUrls: prepResult.imageUrls,
        nologo: true,
        enhance: false,
      });

      setResultUrl(transformResult.imageUrl);
      setStatus('success');

      // Save to history
      await saveTransformation(transformResult.imageUrl);

    } catch (err) {
      console.error('Transformation error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Transformation failed');
      Alert.alert('Transformation Failed', error || 'An error occurred');
    }
  };

  const saveTransformation = async (imageUrl: string) => {
    try {
      // Download and save the image locally since Pollinations URLs are temporary
      const filename = `reimagine_${Date.now()}.jpg`;
      const fileUri = FileSystem.documentDirectory + filename;
      
      console.log('💾 Downloading transformed image locally...');
      await FileSystem.downloadAsync(imageUrl, fileUri);
      console.log('✅ Image saved locally:', fileUri);

      const version: TransformationVersion = {
        id: `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        versionNumber: 1,
        prompt: prompt.trim(),
        resultUrl: fileUri,
        model: model!,
        params: {
          width: 1024,
          height: 1024,
          nologo: true,
        },
        timestamp: new Date().toISOString(),
      };

      if (currentChainId) {
        const chain = await TransformationService.getChain(currentChainId);
        if (chain) {
          version.versionNumber = chain.versions.length + 1;
          await TransformationService.addVersion(currentChainId, version);
        }
      } else {
        const newChain = await TransformationService.createChain(selectedImages, version);
        setCurrentChainId(newChain.id);
      }

      console.log('✅ Transformation saved to history with local file');
    } catch (error) {
      console.error('Error saving transformation:', error);
      Alert.alert('Warning', 'Transformation completed but failed to save to history');
    }
  };

  const renderStatusMessage = () => {
    switch (status) {
      case 'preparing':
        return 'Validating images...';
      case 'uploading':
        return 'Uploading images...';
      case 'transforming':
        return 'Transforming with AI...';
      case 'success':
        return 'Transformation complete!';
      case 'error':
        return error || 'An error occurred';
      default:
        return '';
    }
  };

  const isLoading = status === 'preparing' || status === 'uploading' || status === 'transforming';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.headerBackground }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Transform</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Selected Images Preview */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Selected Images ({selectedImages.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesPreview}>
            {selectedImages.map((img, index) => (
              <View key={img.id} style={styles.previewImageContainer}>
                <OptimizedImage
                  source={{ uri: img.thumbnail }}
                  style={styles.previewImage}
                  contentFit="contain"
                  imageId={img.id}
                  source_type={img.source}
                />
                <View style={[styles.imageIndexBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.imageIndexText}>{index + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Model Info */}
        <View style={[styles.modelInfo, { backgroundColor: theme.colors.card }]}>
          <Ionicons name="color-wand" size={20} color={theme.colors.primary} />
          <Text style={[styles.modelText, { color: theme.colors.text }]}>
            Using <Text style={{ fontWeight: 'bold' }}>{modelName}</Text> model
          </Text>
        </View>

        {/* Prompt Input */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Transformation Prompt
          </Text>
          <TextInput
            style={[
              styles.promptInput,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Describe how you want to transform the image(s)..."
            placeholderTextColor={theme.colors.textSecondary}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isLoading}
          />
          <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
            Example: "make it cyberpunk style", "turn into watercolor painting", "add neon lights"
          </Text>
        </View>

        {/* Result Preview */}
        {resultUrl && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Result</Text>
            <OptimizedImage
              source={{ uri: resultUrl }}
              style={styles.resultImage}
              contentFit="contain"
            />
          </View>
        )}

        {/* Status Message */}
        {status !== 'idle' && (
          <View
            style={[
              styles.statusContainer,
              {
                backgroundColor:
                  status === 'error'
                    ? `${theme.colors.error}20`
                    : status === 'success'
                    ? `${theme.colors.primary}20`
                    : theme.colors.card,
              },
            ]}
          >
            {isLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    status === 'error'
                      ? theme.colors.error
                      : status === 'success'
                      ? theme.colors.primary
                      : theme.colors.text,
                },
              ]}
            >
              {renderStatusMessage()}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Transform Button */}
      <View style={[styles.footer, { backgroundColor: theme.colors.headerBackground }]}>
        <TouchableOpacity
          style={[
            styles.transformButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: isLoading || !prompt.trim() ? 0.5 : 1,
            },
          ]}
          onPress={handleTransform}
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="color-wand" size={20} color="#FFFFFF" />
              <Text style={styles.transformButtonText}>
                {resultUrl ? 'Transform Again' : 'Transform'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  imagesPreview: {
    flexDirection: 'row',
  },
  previewImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  imageIndexBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 8,
    gap: 8,
  },
  modelText: {
    fontSize: 14,
  },
  promptInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  resultImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  transformButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  transformButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});