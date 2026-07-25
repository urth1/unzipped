import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { supabase } from '../supabaseClient';

interface BagItem {
  id: string;
  title: string;
  creator_name: string;
  canvas_json: string;
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
  currentUserId?: string; // Pass the logged-in user's ID/name if available
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

    // Fetch likes and comments for this specific bag
    fetchEngagementData();

    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 350,
      height: 450,
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

    // 1. Get total likes count
    const { count, error: likesError } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('bag_id', bag.id);

    if (!likesError && count !== null) {
      setLikesCount(count);
    }

    // 2. Check if current user has liked it
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

    // 3. Fetch comments
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
      // Unlike
      await supabase
        .from('likes')
        .delete()
        .eq('bag_id', bag.id)
        .eq('user_id', currentUserId);

      setHasLiked(false);
      setLikesCount((prev) => Math.max(0, prev - 1));
    } else {
      // Like
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Canvas Preview */}
        <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl border p-4">
          <h3 className="text-lg font-bold text-gray-900 mb-2">{bag.title}</h3>
          <p className="text-xs text-gray-500 mb-4">Designed by {bag.creator_name}</p>
          <canvas ref={canvasRef} />
          
          {/* Like Button */}
          <button
            onClick={handleToggleLike}
            className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-full font-medium transition ${
              hasLiked 
                ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span>{hasLiked ? '❤️' : '🤍'}</span>
            <span>{likesCount} {likesCount === 1 ? 'Like' : 'Likes'}</span>
          </button>
        </div>

        {/* Right Column: Comments Section */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h4 className="font-semibold text-gray-800">Discussion ({comments.length})</h4>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Comment List */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 mb-4">
              {comments.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-8">No comments yet. Be the first to share your thoughts!</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 p-3 rounded-lg border text-sm">
                    <span className="font-semibold text-gray-900 block text-xs mb-1">{comment.user_id}</span>
                    <p className="text-gray-700">{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Comment Form */}
          <form onSubmit={handleAddComment} className="flex gap-2 pt-3 border-t">
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              Post
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};