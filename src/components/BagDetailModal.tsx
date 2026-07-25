import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { supabase } from '../supabaseClient';

interface BagItem {
  id: string;
  title: string;
  user_id?: string;
  creator_name?: string;
  canvas_json: string;
  profiles?: {
    username: string;
  };
}

interface CommentItem {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface BagDetailModalProps {
  bag: BagItem | null;
  onClose: () => void;
  currentUserId?: string;
}

export const BagDetailModal: React.FC<BagDetailModalProps> = ({ 
  bag, 
  onClose, 
  currentUserId = 'Anonymous Creator' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  const [likesCount, setLikesCount] = useState<number>(0);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newCommentText, setNewCommentText] = useState<string>('');

  useEffect(() => {
    if (!bag) return;

    fetchEngagementData();

    if (!canvasRef.current) return;

    // Match the full canvas dimensions of the creator view so nothing gets cut off
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 620,
      height: 480,
      backgroundColor: '#FCFBF0',
      interactive: false,
    });

    fabricRef.current = canvas;

    if (bag.canvas_json) {
      canvas.loadFromJSON(bag.canvas_json).then(() => {
        canvas.getObjects().forEach((obj) => {
          obj.set({
            selectable: false,
            evented: false,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
          });
        });
        canvas.renderAll();
      });
    }

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [bag]);

  const fetchEngagementData = async () => {
    if (!bag) return;

    const { count, error: likesError } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('bag_id', bag.id);

    if (!likesError && count !== null) {
      setLikesCount(count);
    }

    const { data: userLike, error: userLikeError } = await supabase
      .from('likes')
      .select('*')
      .eq('bag_id', bag.id)
      .eq('user_id', currentUserId)
      .single();

    if (!userLikeError && userLike) {
      setHasLiked(true);
    } else {
      setHasLiked(false);
    }

    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .eq('bag_id', bag.id)
      .order('created_at', { ascending: false });

    if (!commentsError && commentsData) {
      setComments(commentsData);
    }
  };

  const handleToggleLike = async () => {
    if (!bag) return;

    if (hasLiked) {
      await supabase
        .from('likes')
        .delete()
        .eq('bag_id', bag.id)
        .eq('user_id', currentUserId);

      setHasLiked(false);
      setLikesCount((prev) => Math.max(0, prev - 1));
    } else {
      await supabase
        .from('likes')
        .insert([{ bag_id: bag.id, user_id: currentUserId }]);

      setHasLiked(true);
      setLikesCount((prev) => prev + 1);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bag || !newCommentText.trim()) return;

    const { data, error } = await supabase
      .from('comments')
      .insert([
        {
          bag_id: bag.id,
          user_id: currentUserId,
          content: newCommentText.trim(),
        },
      ])
      .select();

    if (!error && data) {
      setComments([data[0], ...comments]);
      setNewCommentText('');
    }
  };

  if (!bag) return null;

  const authorName = bag.profiles?.username || bag.creator_name || 'username';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'var(--bg-royal, #1239A0)',
      zIndex: 1000,
      overflowY: 'auto',
      padding: '40px 32px',
      color: '#FCFBF0',
      boxSizing: 'border-box'
    }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: '2.5rem', fontStyle: 'italic', margin: '0 0 4px 0' }}>unzipped</h2>
          <p style={{ fontSize: '1.2rem', margin: 0, fontStyle: 'italic', opacity: 0.9 }}>feed:</p>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: '1px solid #FCFBF0', color: '#FCFBF0', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontStyle: 'italic' }}
        >
          ← back to feed
        </button>
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px', alignItems: 'flex-start', justifyContent: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Left Column: Author, Likes, Comments */}
        <div style={{ flex: '1', minWidth: '300px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <h3 style={{ fontSize: '2rem', fontStyle: 'italic', margin: 0 }}>
            @{authorName}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '1.2rem', fontStyle: 'italic' }}>
              likes: {likesCount}
            </span>
            <button
              onClick={handleToggleLike}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', padding: 0 }}
              title={hasLiked ? 'Unlike' : 'Like'}
            >
              {hasLiked ? '❤️' : '🤍'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(252,251,240,0.3)', paddingBottom: '8px' }}>
              <span style={{ fontStyle: 'italic', fontSize: '1.1rem' }}>comments:</span>
            </div>

            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="comment here..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #FCFBF0',
                  color: '#FCFBF0',
                  padding: '6px 0',
                  fontSize: '1rem',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#FCFBF0',
                  color: 'var(--text-blue, #1239A0)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontFamily: 'inherit'
                }}
              >
                Post
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto', marginTop: '8px' }}>
              {comments.length === 0 ? (
                <p style={{ fontStyle: 'italic', fontSize: '0.95rem', opacity: 0.8, margin: 0 }}>No comments yet. Be the first to share your thoughts!</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontStyle: 'italic', fontSize: '0.9rem', opacity: 0.9 }}>@{comment.user_id}</span>
                    <span style={{ fontSize: '1rem', paddingLeft: '8px' }}>{comment.content}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Full Cream Bag Card */}
        <div style={{
          backgroundColor: 'var(--bg-cream, #FCFBF0)',
          color: 'var(--text-blue, #1239A0)',
          borderRadius: '32px',
          padding: '24px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
          <div style={{ backgroundColor: '#FCFBF0', borderRadius: '16px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} />
          </div>
        </div>

      </div>
    </div>
  );
};