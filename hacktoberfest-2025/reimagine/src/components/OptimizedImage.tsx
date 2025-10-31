import React, { useState, useEffect, useMemo } from 'react';
import { Image, ImageProps } from 'expo-image';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BannedImagesService from '../services/BannedImagesService';

interface OptimizedImageProps extends Omit<ImageProps, 'source'> {
  source: { uri: string };
  showLoader?: boolean;
  placeholder?: string;
  placeholderContentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  imageId?: string;
  source_type?: 'lexica' | 'civitai';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
    source,
    showLoader = true,
    placeholder,
    placeholderContentFit = 'cover',
    style,
    onLoad,
    onError,
    imageId,
    source_type = 'lexica',
    ...props
  }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [bannedCheckCompleted, setBannedCheckCompleted] = useState(false);


  useEffect(() => {
    setIsLoading(true);
    setError(false);
  }, [source.uri]);

  useEffect(() => {
    const checkIfBanned = async () => {
      if (!imageId) {
        setBannedCheckCompleted(true);
        return;
      }

      try {
        const banned = await BannedImagesService.isImageBanned(imageId);
        setIsBanned(banned);
      } catch (error) {
        console.error('Error checking banned status:', error);
        setIsBanned(false);
      } finally {
        setBannedCheckCompleted(true);
      }
    };

    setBannedCheckCompleted(false);
    checkIfBanned();
  }, [imageId]);

  const handleLoad = (event: any) => {
    setIsLoading(false);
    setError(false);
    onLoad?.(event);
  };

  const handleError = (event: any) => {
    setError(true);
    setIsLoading(false);
    onError?.(event);
  };

  // ✅ Mémoiser style to avoid re-renders
  const imageStyle = useMemo(() => [
    style,
    isBanned && styles.blurredImage
  ], [style, isBanned]);

  if (error) {
    return (
        <View style={[style, styles.errorContainer]}>
          <Ionicons name="image-outline" size={32} color="#999" />
          <Text style={styles.errorText}>Failed to load</Text>
        </View>
    );
  }

  if (!source.uri) {
    return (
        <View style={[style, styles.errorContainer]}>
          <Ionicons name="image-outline" size={32} color="#999" />
        </View>
    );
  }

  return (
      <View style={[style, { position: 'relative' }]}>
        <Image
            {...props}
            source={source}
            style={imageStyle}
            onLoad={handleLoad}
            onError={handleError}
            cachePolicy="memory-disk"
            transition={200}
            placeholder={placeholder}
            placeholderContentFit={placeholderContentFit}
            priority="high"
        />

        {showLoader && isLoading && (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
        )}

        {/* Overlay for banned images */}
        {isBanned && bannedCheckCompleted && (
            <View style={styles.bannedOverlay}>
              <View style={styles.bannedContent}>
                <Ionicons name="eye-off" size={32} color="#FFFFFF" />
                <Text style={styles.bannedText}>Content Hidden</Text>
                <Text style={styles.bannedSubtext}>
                  This image has been reported and is currently under review
                </Text>
              </View>
            </View>
        )}
      </View>
  );
};

const styles = StyleSheet.create({
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#999',
  },
  blurredImage: {
    opacity: 0.3,
  },
  bannedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  bannedContent: {
    alignItems: 'center',
    padding: 20,
    maxWidth: '80%',
  },
  bannedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  bannedSubtext: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 16,
  },
});