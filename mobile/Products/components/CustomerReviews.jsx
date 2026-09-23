import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { colors, fonts } from '../../Checkout/src/theme';
import { getReviewsForProduct, getReviewStats, addReviewForProduct } from '../data/reviewsData';

export default function CustomerReviews({ productId }) {
  const [reviews, setReviews] = useState(() => getReviewsForProduct(productId));
  const [showAll, setShowAll] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newAuthor, setNewAuthor] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const stats = getReviewStats(reviews);
  const displayedReviews = showAll ? reviews : reviews.slice(0, 2);

  useEffect(() => {
    if (!productId) return;
    fetch(`http://10.0.2.2:8000/products/${productId}/reviews/`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.reviews && data.reviews.length > 0) {
          setReviews(data.reviews);
        }
      })
      .catch(() => {
        // Graceful fallback to seeded reviews
      });
  }, [productId]);

  const handleSubmitReview = async () => {
    if (!newComment.trim()) {
      setErrorMsg('Please enter your review comments.');
      return;
    }

    const reviewPayload = {
      author: newAuthor.trim() || 'Verified Buyer',
      rating: newRating,
      comment: newComment.trim(),
    };

    try {
      const response = await fetch(`http://10.0.2.2:8000/products/${productId}/reviews/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-ID': '1',
        },
        body: JSON.stringify(reviewPayload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.review) {
          setReviews((current) => [data.review, ...current]);
        } else {
          const updated = addReviewForProduct(productId, reviewPayload);
          setReviews([...updated]);
        }
      } else {
        const updated = addReviewForProduct(productId, reviewPayload);
        setReviews([...updated]);
      }
    } catch {
      const updated = addReviewForProduct(productId, reviewPayload);
      setReviews([...updated]);
    }

    setNewAuthor('');
    setNewComment('');
    setNewRating(5);
    setErrorMsg('');
    setModalVisible(false);
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= rating ? '★' : '☆');
    }
    return stars.join('');
  };

  return (
    <View style={styles.container}>
      {/* Header Row per Figma M04a */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingScore}>{stats.average}</Text>
            <Text style={styles.ratingStars}>★★★★★</Text>
            <Text style={styles.ratingCount}>({stats.count})</Text>
          </View>
        </View>

        <View style={styles.actionGroup}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowAll(!showAll)}
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>
              {showAll ? 'Show less' : `See all ${stats.count} →`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Review Cards List */}
      <View style={styles.reviewList}>
        {displayedReviews.map((rev) => (
          <View key={rev.id} style={styles.reviewCard}>
            <View style={styles.cardHeader}>
              <View style={styles.authorBadgeRow}>
                <Text style={styles.authorName}>{rev.author}</Text>
                {rev.verified && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>VERIFIED</Text>
                  </View>
                )}
              </View>
              <View style={styles.starRow}>
                <Text style={styles.cardStars}>{renderStars(rev.rating)}</Text>
              </View>
            </View>

            <Text style={styles.commentText}>{rev.comment}</Text>

            {rev.date && <Text style={styles.dateText}>{rev.date}</Text>}
          </View>
        ))}
      </View>

      {/* Write a Review Button */}
      <TouchableOpacity
        accessibilityLabel="Write a review"
        accessibilityRole="button"
        onPress={() => setModalVisible(true)}
        style={styles.writeReviewButton}
      >
        <Text style={styles.writeReviewButtonText}>+ Write a Review</Text>
      </TouchableOpacity>

      {/* Interactive Write Review Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        transparent={true}
        visible={modalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Write a Review</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Star Selection */}
              <Text style={styles.inputLabel}>RATING</Text>
              <View style={styles.starSelectRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setNewRating(star)}
                    style={styles.starTouch}
                  >
                    <Text style={[styles.starIcon, star <= newRating ? styles.starFilled : styles.starEmpty]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.ratingGuide}>{newRating} of 5 Stars</Text>
              </View>

              {/* Name Input */}
              <Text style={styles.inputLabel}>YOUR NAME</Text>
              <TextInput
                onChangeText={setNewAuthor}
                placeholder="e.g. Juan D."
                placeholderTextColor={colors.muted}
                style={styles.textInput}
                value={newAuthor}
              />

              {/* Comment Input */}
              <Text style={styles.inputLabel}>COMMENT / FEEDBACK</Text>
              <TextInput
                multiline
                numberOfLines={3}
                onChangeText={(text) => {
                  setNewComment(text);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="How was the sizing, fleece quality, and fit?"
                placeholderTextColor={colors.muted}
                style={[styles.textInput, styles.textArea]}
                value={newComment}
              />

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              {/* Submit Button */}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleSubmitReview}
                style={styles.submitButton}
              >
                <Text style={styles.submitButtonText}>Submit Review</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.interBold || fonts.helveticaNeueBold,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingScore: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  ratingStars: {
    fontSize: 11,
    color: '#5C6B12',
    letterSpacing: 1,
  },
  ratingCount: {
    fontSize: 12,
    color: colors.muted,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  reviewList: {
    gap: 10,
  },
  reviewCard: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.interSemiBold || fonts.helveticaNeueBold,
  },
  verifiedBadge: {
    backgroundColor: colors.volt,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.5,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStars: {
    fontSize: 12,
    color: '#5C6B12',
    letterSpacing: 1,
  },
  commentText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  dateText: {
    fontSize: 11,
    color: '#999990',
    marginTop: 2,
  },
  writeReviewButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  writeReviewButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.2,
  },
  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.muted,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 8,
  },
  starSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  starTouch: {
    padding: 2,
  },
  starIcon: {
    fontSize: 24,
  },
  starFilled: {
    color: '#EAB308',
  },
  starEmpty: {
    color: '#D1D5DB',
  },
  ratingGuide: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginLeft: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.paper,
    marginBottom: 10,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: colors.volt,
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.interBold,
  },
});
