import { Ionicons } from "@expo/vector-icons";
import { MasonryFlashList } from "@shopify/flash-list";
import * as ImagePicker from "expo-image-picker";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { OptimizedImage } from "../components/OptimizedImage";
import ReportImageModal from "../components/ReportImageModal";
import VersionChecker from "../components/VersionChecker";
import { useTheme } from "../context/ThemeContext";
import type { TabScreenProps } from "../navigation/types";
import { civitaiService } from "../services/CivitaiService";
import type {
    CivitaiImage,
    NSFWFilter,
    TrendingFilters,
    TrendingPeriod,
    TrendingSort,
} from "../types/civitai";
import type { ImageSource } from "../types/imageSelection";

const SORT_OPTIONS: { label: string; value: TrendingSort }[] = [
    { label: "Most Popular", value: "Most Reactions" },
    { label: "Most Discussed", value: "Most Comments" },
    { label: "Newest", value: "Newest" },
];

const PERIOD_OPTIONS: { label: string; value: TrendingPeriod }[] = [
    { label: "Today", value: "Day" },
    { label: "This Week", value: "Week" },
    { label: "This Month", value: "Month" },
    { label: "All Time", value: "AllTime" },
];

const NSFW_OPTIONS: { label: string; value: NSFWFilter }[] = [
    { label: "Safe Only", value: "None" },
    { label: "Include Soft", value: "Soft" },
    { label: "All Content", value: "All" },
];

// ImageItem component OUTSIDE of HomeScreen to avoid re-creation
interface ImageItemProps {
    item: CivitaiImage;
    onPress: (image: CivitaiImage) => void;
    onReport: (image: CivitaiImage) => void;
    theme: any;
    selectionMode: boolean;
    isSelected: boolean;
    selectionNum: number;
}

const ImageItem = React.memo<ImageItemProps>(
    ({
        item,
        onPress,
        onReport,
        theme,
        selectionMode,
        isSelected,
        selectionNum,
    }) => {
        const aspectRatio =
            item.width && item.height ? item.width / item.height : 1;

        return (
            <View style={styles.imageContainer}>
                <TouchableOpacity onPress={() => onPress(item)}>
                    <OptimizedImage
                        source={{ uri: civitaiService.getImageUrl(item, 100) }}
                        style={[styles.image, { aspectRatio }]}
                        contentFit="cover"
                        transition={200}
                        imageId={item.id.toString()}
                        source_type="civitai"
                    />
                    {selectionMode && (
                        <View style={styles.selectionOverlay}>
                            <View
                                style={[
                                    styles.selectionCheckbox,
                                    {
                                        backgroundColor: isSelected
                                            ? theme.colors.primary
                                            : "rgba(0,0,0,0.5)",
                                        borderColor: isSelected
                                            ? theme.colors.primary
                                            : "#FFFFFF",
                                    },
                                ]}
                            >
                                {isSelected && selectionNum > 0 && (
                                    <Text style={styles.selectionNumber}>
                                        {selectionNum}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {!selectionMode && (
                        <TouchableOpacity
                            style={[
                                styles.reportButton,
                                { backgroundColor: "rgba(0,0,0,0.6)" },
                            ]}
                            onPress={(e) => {
                                e.stopPropagation();
                                onReport(item);
                            }}
                            hitSlop={{
                                top: 10,
                                bottom: 10,
                                left: 10,
                                right: 10,
                            }}
                        >
                            <Ionicons name="flag" size={10} color="#FFFFFF" />
                        </TouchableOpacity>
                    )}

                    {!selectionMode && (
                        <View
                            style={[
                                styles.engagementOverlay,
                                { backgroundColor: theme.colors.overlay },
                            ]}
                        >
                            <View style={styles.engagementStats}>
                                {item.stats.likeCount > 0 && (
                                    <View style={styles.statItem}>
                                        <Ionicons
                                            name="heart"
                                            size={12}
                                            color="#FF6B6B"
                                        />
                                        <Text
                                            style={[
                                                styles.statText,
                                                { color: "#FFFFFF" },
                                            ]}
                                        >
                                            {item.stats.likeCount}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        );
    },
    (prevProps, nextProps) => {
        // Only re-render if something meaningful changed for THIS specific item
        if (prevProps.item.id !== nextProps.item.id) return false;
        if (prevProps.selectionMode !== nextProps.selectionMode) return false;
        if (prevProps.isSelected !== nextProps.isSelected) return false;
        if (prevProps.selectionNum !== nextProps.selectionNum) return false;
        return true;
    },
);

ImageItem.displayName = "ImageItem";

export default function HomeScreen({ navigation }: TabScreenProps<"Home">) {
    const { theme } = useTheme();
    const [images, setImages] = useState<CivitaiImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [cursor, setCursor] = useState<number | undefined>(undefined);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [showFilters, setShowFilters] = useState(false);

    const listRef = useRef<MasonryFlashList<CivitaiImage>>(null);
    const imageIdsRef = useRef<Set<number>>(new Set());

    // Selection state
    const [selectedImages, setSelectedImages] = useState<ImageSource[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectionVersion, setSelectionVersion] = useState(0);

    const [networkError, setNetworkError] = useState(false);

    // Update version when selection changes
    useEffect(() => {
        setSelectionVersion((prev) => prev + 1);
    }, []);

    // Report state
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [reportingImage, setReportingImage] = useState<CivitaiImage | null>(
        null,
    );

    const [filters, setFilters] = useState<TrendingFilters>({
        sort: "Most Reactions",
        period: "Week",
        nsfw: "None",
    });

    const fetchTrendingImages = useCallback(
        async (pageNum: number = 1, reset: boolean = false) => {
            if (loading && !refreshing) return;

            try {
                setNetworkError(false);
                if (reset) {
                    setLoading(true);
                    setCursor(undefined);
                } else {
                    setLoading(true);
                }

                const currentCursor = reset ? undefined : cursor;
                const response = await civitaiService.getTrendingImages(
                    filters,
                    pageNum,
                    100,
                    currentCursor,
                );

                if (response.items.length === 0) {
                    setHasNextPage(false);
                    setLoading(false);
                    setRefreshing(false);
                    return;
                }

                setImages((prevImages) => {
                    const currentImages = reset ? [] : prevImages;
                    if (reset) {
                        return response.items;
                    } else {
                        const existingIds = new Set(
                            currentImages.map((img) => img.id),
                        );
                        const newItems = response.items.filter(
                            (item) => !existingIds.has(item.id),
                        );
                        return [...currentImages, ...newItems];
                    }
                });

                if (reset) {
                    setPage(1);
                } else {
                    setPage(pageNum);
                }

                let nextPageAvailable = false;
                if (response.metadata.nextCursor) {
                    setCursor(response.metadata.nextCursor);
                    nextPageAvailable = true;
                } else if (response.metadata.nextPage) {
                    nextPageAvailable = true;
                }

                setHasNextPage(nextPageAvailable);
            } catch (err) {
                console.error("❌ API Error:", err);
                setNetworkError(true);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [filters, cursor, loading, refreshing],
    );

    useEffect(() => {
        imageIdsRef.current.clear();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        fetchTrendingImages(1, true);
    }, [fetchTrendingImages]);

    const handleFilterChange = (key: keyof TrendingFilters, value: any) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleRefresh = () => {
        setRefreshing(true);
        setPage(1);
        setCursor(undefined);
        fetchTrendingImages(1, true);
    };

    const handleLoadMore = () => {
        if (!loading && hasNextPage) {
            if (cursor) {
                fetchTrendingImages(page, false);
            } else {
                fetchTrendingImages(page + 1, false);
            }
        }
    };

    // Selection handlers
    const handleImagePress = useCallback((image: CivitaiImage) => {
        const imageId = image.id.toString();

        setSelectedImages((prev) => {
            // Check if already selected
            const isSelected = prev.some((img) => img.id === imageId);

            if (isSelected) {
                // Deselect
                const newSelection = prev.filter((img) => img.id !== imageId);

                // Exit selection mode if no images left
                if (newSelection.length === 0) {
                    setSelectionMode(false);
                }

                return newSelection;
            } else {
                // Check limit before selecting
                if (prev.length >= 4) {
                    Alert.alert(
                        "Maximum Selection",
                        "You can select up to 4 images",
                    );
                    return prev; // Return unchanged state
                }

                // Create image source
                const imageSource: ImageSource = {
                    id: imageId,
                    url: civitaiService.getImageUrl(image, 450),
                    thumbnail: civitaiService.getImageUrl(image, 100),
                    source: "civitai",
                    needsUpload: false,
                    width: image.width,
                    height: image.height,
                };

                // Enter selection mode
                setSelectionMode(true);

                // Select and return new array
                return [...prev, imageSource];
            }
        });
    }, []); // Empty dependency array!

    const handleReportImage = useCallback((image: CivitaiImage) => {
        setReportingImage(image);
        setReportModalVisible(true);
    }, []);

    const handlePickLocalImage = async () => {
        try {
            const { status } =
                await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
                Alert.alert(
                    "Permission Required",
                    "Please grant media library access",
                );
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                selectionLimit: 4 - selectedImages.length,
                quality: 1,
            });

            if (!result.canceled && result.assets) {
                const newImages: ImageSource[] = result.assets.map((asset) => ({
                    id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    localUri: asset.uri,
                    thumbnail: asset.uri,
                    source: "local",
                    needsUpload: true,
                    width: asset.width,
                    height: asset.height,
                }));

                if (selectedImages.length + newImages.length > 4) {
                    Alert.alert(
                        "Maximum Selection",
                        "You can select up to 4 images total",
                    );
                    return;
                }

                setSelectedImages((prev) => [...prev, ...newImages]);
                setSelectionMode(true);
            }
        } catch (error) {
            console.error("Error picking image:", error);
            Alert.alert("Error", "Failed to pick image");
        }
    };

    const handleClearSelection = () => {
        setSelectedImages([]);
        setSelectionMode(false);
    };

    const handleTransform = () => {
        if (selectedImages.length === 0) {
            Alert.alert(
                "No Images Selected",
                "Please select 1-4 images to transform",
            );
            return;
        }

        navigation.navigate("EditScreen", {
            selectedImages,
        });
    };

    const getItemKey = (item: CivitaiImage) => {
        return item.id.toString();
    };

    const renderFilterButton = (
        label: string,
        options: { label: string; value: any }[],
        currentValue: any,
        onSelect: (value: any) => void,
    ) => (
        <TouchableOpacity
            style={[
                styles.filterButton,
                {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                },
            ]}
            onPress={() => {
                Alert.alert(
                    label,
                    "Select an option",
                    options.map((option) => ({
                        text: option.label,
                        onPress: () => onSelect(option.value),
                        style:
                            option.value === currentValue
                                ? "default"
                                : "cancel",
                    })),
                );
            }}
        >
            <Text
                style={[styles.filterButtonText, { color: theme.colors.text }]}
            >
                {options.find((opt) => opt.value === currentValue)?.label ||
                    label}
            </Text>
            <Ionicons
                name="chevron-down"
                size={16}
                color={theme.colors.textSecondary}
            />
        </TouchableOpacity>
    );

    const ListFooter = useMemo(() => {
        if (loading && images.length > 0) {
            return (
                <View style={styles.loadingFooter}>
                    <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                    />
                </View>
            );
        }
        return null;
    }, [loading, images.length, theme.colors.primary]);

    const contentContainerStyle = useMemo(() => ({ paddingTop: 8 }), []);

    // Create lookup object for selection - but pass primitives to items
    const renderImageItem = useCallback(
        ({ item }: { item: CivitaiImage }) => {
            const imageId = item.id.toString();
            const selectionIndex = selectedImages.findIndex(
                (img) => img.id === imageId,
            );
            const isSelected = selectionIndex !== -1;
            const selectionNum = isSelected ? selectionIndex + 1 : 0;

            return (
                <ImageItem
                    item={item}
                    onPress={handleImagePress}
                    onReport={handleReportImage}
                    theme={theme}
                    selectionMode={selectionMode}
                    isSelected={isSelected}
                    selectionNum={selectionNum}
                />
            );
        },
        [
            handleImagePress,
            handleReportImage,
            theme,
            selectionMode,
            selectedImages,
        ],
    );

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Ionicons
                name="images-outline"
                size={64}
                color={theme.colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                No Images
            </Text>
            <Text
                style={[
                    styles.emptyDescription,
                    { color: theme.colors.textSecondary },
                ]}
            >
                Try adjusting your filters
            </Text>
        </View>
    );

    const renderNoConnectionState = () => (
        <View style={styles.emptyContainer}>
            <Ionicons
                name="cloud-offline-outline"
                size={64}
                color={theme.colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                No Connection
            </Text>
            <Text
                style={[
                    styles.emptyDescription,
                    { color: theme.colors.textSecondary },
                ]}
            >
                Please check your internet connection
            </Text>
        </View>
    );

    return (
        <VersionChecker packageName="com.ismafly.reimagine">
            <View
                style={[
                    styles.container,
                    { backgroundColor: theme.colors.background },
                ]}
            >
                {/* Header */}
                <View
                    style={[
                        styles.header,
                        { backgroundColor: theme.colors.headerBackground },
                    ]}
                >
                    <View style={styles.titleContainer}>
                        <Text
                            style={[styles.title, { color: theme.colors.text }]}
                        >
                            Browse
                        </Text>
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                onPress={handlePickLocalImage}
                                style={styles.headerButton}
                            >
                                <Ionicons
                                    name="cloud-upload-outline"
                                    size={24}
                                    color={theme.colors.primary}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setShowFilters(!showFilters)}
                                style={styles.headerButton}
                            >
                                <Ionicons
                                    name="options-outline"
                                    size={24}
                                    color={theme.colors.primary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {showFilters && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.filtersContainer}
                        >
                            {renderFilterButton(
                                "Sort",
                                SORT_OPTIONS,
                                filters.sort,
                                (value) => handleFilterChange("sort", value),
                            )}
                            {renderFilterButton(
                                "Period",
                                PERIOD_OPTIONS,
                                filters.period,
                                (value) => handleFilterChange("period", value),
                            )}
                            {renderFilterButton(
                                "Content",
                                NSFW_OPTIONS,
                                filters.nsfw,
                                (value) => handleFilterChange("nsfw", value),
                            )}
                        </ScrollView>
                    )}
                </View>

                {/* Image grid */}
                {loading && images.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator
                            size="large"
                            color={theme.colors.primary}
                        />
                    </View>
                ) : networkError && images.length === 0 ? (
                    renderNoConnectionState()
                ) : (
                    <MasonryFlashList
                        ref={listRef}
                        data={images}
                        renderItem={renderImageItem}
                        keyExtractor={getItemKey}
                        estimatedItemSize={200}
                        numColumns={2}
                        initialNumToRender={20}
                        maxToRenderPerBatch={10}
                        windowSize={11}
                        drawDistance={3000}
                        removeClippedSubviews={true}
                        updateCellsBatchingPeriod={50}
                        onRefresh={handleRefresh}
                        refreshing={refreshing}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        ListEmptyComponent={renderEmptyState}
                        ListFooterComponent={ListFooter}
                        contentContainerStyle={contentContainerStyle}
                        extraData={selectionVersion}
                    />
                )}

                {/* Selection Bar */}
                {selectionMode && (
                    <View
                        style={[
                            styles.selectionBar,
                            { backgroundColor: theme.colors.headerBackground },
                        ]}
                    >
                        <TouchableOpacity
                            onPress={handleClearSelection}
                            style={styles.clearButton}
                        >
                            <Ionicons
                                name="close-circle"
                                size={24}
                                color={theme.colors.error}
                            />
                            <Text
                                style={[
                                    styles.selectionText,
                                    { color: theme.colors.text },
                                ]}
                            >
                                {selectedImages.length} selected
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.transformButton,
                                {
                                    backgroundColor: theme.colors.primary,
                                    opacity:
                                        selectedImages.length === 0 ? 0.5 : 1,
                                },
                            ]}
                            onPress={handleTransform}
                            disabled={selectedImages.length === 0}
                        >
                            <Ionicons
                                name="color-wand"
                                size={20}
                                color="#FFFFFF"
                            />
                            <Text style={styles.transformButtonText}>
                                Transform
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Report Image Modal */}
                {reportingImage && (
                    <ReportImageModal
                        visible={reportModalVisible}
                        onClose={() => {
                            setReportModalVisible(false);
                            setReportingImage(null);
                        }}
                        imageId={reportingImage.id.toString()}
                        imageUrl={civitaiService.getImageUrl(
                            reportingImage,
                            450,
                        )}
                        source="civitai"
                        prompt={reportingImage.meta?.prompt || ""}
                    />
                )}
            </View>
        </VersionChecker>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    titleContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
    },
    headerActions: {
        flexDirection: "row",
        gap: 12,
    },
    headerButton: {
        padding: 4,
    },
    filtersContainer: {
        flexDirection: "row",
    },
    filterButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 8,
        gap: 4,
    },
    filterButtonText: {
        fontSize: 14,
        fontWeight: "500",
    },
    imageContainer: {
        flex: 1,
        padding: 2,
    },
    image: {
        width: "100%",
        borderRadius: 12,
    },
    selectionOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "flex-start",
        alignItems: "flex-end",
        padding: 8,
    },
    selectionCheckbox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        justifyContent: "center",
        alignItems: "center",
    },
    selectionNumber: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "bold",
    },
    reportButton: {
        position: "absolute",
        bottom: 8,
        left: 8,
        width: 20,
        height: 20,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    engagementOverlay: {
        position: "absolute",
        top: 8,
        right: 8,
        borderRadius: 12,
        padding: 6,
    },
    engagementStats: {
        flexDirection: "row",
        gap: 8,
    },
    statItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
    },
    statText: {
        fontSize: 10,
        fontWeight: "600",
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 32,
        marginTop: 100,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "600",
        marginTop: 16,
        marginBottom: 8,
    },
    emptyDescription: {
        fontSize: 16,
        textAlign: "center",
    },
    loadingFooter: {
        padding: 16,
        alignItems: "center",
    },
    selectionBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 32,
    },
    clearButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    selectionText: {
        fontSize: 16,
        fontWeight: "500",
    },
    transformButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        gap: 8,
    },
    transformButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "bold",
    },
});
