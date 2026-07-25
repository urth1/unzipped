import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Textbox } from 'fabric';
import { supabase } from './supabaseClient';
import { BagDetailModal } from './components/BagDetailModal';

// @ts-ignore
import './App.css';

interface ProductItem {
  id: string;
  name: string;
  brand: string;
  shade?: string;
  imageUrl: string;
}

interface SavedBag {
  id: string;
  user_id?: string;
  title: string;
  canvas_json: any;
  preview_image?: string;
  is_published: boolean;
  profiles?: {
    username: string;
  };
}

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'feed' | 'editor' | 'add-product' | 'my-bags' | 'profile'>('home');
  const [bagTitle, setBagTitle] = useState("enter the name of your makeup bag");
  const [currentBagId, setCurrentBagId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Modal State for Up-Close View, Likes & Comments
  const [selectedBag, setSelectedBag] = useState<any>(null);

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string>('');
  const [newUsernameInput, setNewUsernameInput] = useState<string>('');
  const [usernameUpdateMsg, setUsernameUpdateMsg] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(true);
  const [authError, setAuthError] = useState('');

  // Profile Viewing State
  const [_viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUsername, setViewingUsername] = useState<string | null>(null);
  const [profileBags, setProfileBags] = useState<SavedBag[]>([]);

  // Catalog & Bags State
  const [catalog, setCatalog] = useState<ProductItem[]>([]);
  const [_isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [feedBags, setFeedBags] = useState<SavedBag[]>([]);
  const [myBags, setMyBags] = useState<SavedBag[]>([]);
  const [isSavingBag, setIsSavingBag] = useState(false);
  const [pendingLoadJson, setPendingLoadJson] = useState<any>(null);

  // Form state
  const [newBrand, setNewBrand] = useState('');
  const [newName, setNewName] = useState('');
  const [newShade, setNewShade] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [quickImageUrl, setQuickImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addSuccessMsg, setAddSuccessMsg] = useState(false);

  // Canvas & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fabricCanvas, setFabricCanvas] = useState<Canvas | null>(null);

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
      
    if (data && data.username) {
      setUsername(data.username);
      setNewUsernameInput(data.username);
      setAuthUsername(data.username);
    }
  };

  // Check Auth Session & Profile
  useEffect(() => {
    const getSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      }
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else {
        setUser(null);
        setUsername('');
        setNewUsernameInput('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Update Username Handler from Account View
  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUsernameInput.trim()) return;

    const cleanUsername = newUsernameInput.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ username: cleanUsername })
      .eq('id', user.id);

    if (error) {
      setUsernameUpdateMsg('Error updating username: ' + error.message);
    } else {
      setUsername(cleanUsername);
      setUsernameUpdateMsg('✓ Username updated successfully!');
      fetchFeedBags();
      setTimeout(() => setUsernameUpdateMsg(''), 3000);
    }
  };

  // Fetch Catalog & Feed
  const fetchPublicCatalog = async () => {
    setIsLoadingCatalog(true);
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (data) {
      setCatalog(data.map((item) => ({
        id: item.id,
        brand: item.brand,
        name: item.name,
        shade: item.shade,
        imageUrl: item.image_url,
      })));
    }
    setIsLoadingCatalog(false);
  };

  const fetchFeedBags = async () => {
    const { data } = await supabase
      .from('bags')
      .select('*, profiles(username)')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (data) setFeedBags(data);
  };

  const fetchMyBags = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bags')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setMyBags(data);
  };

  const openUserProfile = async (userId: string, targetUsername: string) => {
    setViewingUserId(userId);
    setViewingUsername(targetUsername);
    const { data } = await supabase
      .from('bags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (data) setProfileBags(data);
    setCurrentView('profile');
  };

  useEffect(() => {
    fetchPublicCatalog();
    fetchFeedBags();
  }, []);

  useEffect(() => {
    if (user) fetchMyBags();
  }, [user]);

  // Auth Handler (Supports both Sign Up and Sign In with Username Upsert)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanUsername = authUsername.trim();
    if (!cleanUsername) {
      setAuthError('Please enter a username.');
      return;
    }

    let userId: string | null = null;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }
      if (data.user) userId = data.user.id;
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }
      if (data.user) userId = data.user.id;
    }

    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{ id: userId, username: cleanUsername }]);

      if (profileError) {
        setAuthError('Failed to save username: ' + profileError.message);
        return;
      }

      setUser({ id: userId });
      setUsername(cleanUsername);
      setNewUsernameInput(cleanUsername);
      setShowAuthModal(false);
      fetchFeedBags();
    }
  };

  // Canvas Setup
  useEffect(() => {
    if (currentView !== 'editor' || !canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 640,
      height: 480,
      backgroundColor: '#FCFBF0',
    });

    setFabricCanvas(canvas);

    if (pendingLoadJson) {
      canvas.loadFromJSON(pendingLoadJson, () => {
        canvas.renderAll();
        setPendingLoadJson(null);
      });
    }

    return () => {
      canvas.dispose();
    };
  }, [currentView, pendingLoadJson]);

  // Image Processing
  const removeBackgroundAndGetUrl = (imgElement: HTMLImageElement): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return imgElement.src;

    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;

    ctx.drawImage(imgElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const lowThreshold = 200;
    const highThreshold = 245;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
      if (brightness >= highThreshold) {
        data[i + 3] = 0;
      } else if (brightness > lowThreshold) {
        const alphaFactor = (highThreshold - brightness) / (highThreshold - lowThreshold);
        data[i + 3] = Math.round(data[i + 3] * alphaFactor);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const addProductToCanvas = (imageUrl: string) => {
    if (!fabricCanvas || !imageUrl) return;
    setIsProcessingBg(true);

    const renderFabricImg = async (url: string) => {
      try {
        const fabricImg = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
        fabricImg.scaleToWidth(130);
        fabricImg.set({
          left: 100 + Math.random() * 80,
          top: 80 + Math.random() * 80,
        });

        fabricCanvas.add(fabricImg);
        fabricCanvas.setActiveObject(fabricImg);
        fabricCanvas.renderAll();
      } catch (err) {
        console.error('Error rendering image:', err);
      } finally {
        setIsProcessingBg(false);
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const cutoutDataUrl = removeBackgroundAndGetUrl(img);
        renderFabricImg(cutoutDataUrl);
      } catch (err) {
        renderFabricImg(imageUrl);
      }
    };

    img.onerror = () => {
      renderFabricImg(imageUrl);
    };
  };

  const handleSaveOrPublish = async (isPublishing: boolean) => {
    if (!fabricCanvas) return;
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsSavingBag(true);

    const canvasJson = fabricCanvas.toJSON();
    const previewDataUrl = fabricCanvas.toDataURL({ format: 'png', multiplier: 0.5 });

    const bagPayload = {
      user_id: user.id,
      title: bagTitle,
      canvas_json: canvasJson,
      preview_image: previewDataUrl,
      is_published: isPublishing,
    };

    let result;
    if (currentBagId) {
      result = await supabase.from('bags').update(bagPayload).eq('id', currentBagId);
    } else {
      result = await supabase.from('bags').insert([bagPayload]).select().single();
      if (result.data) setCurrentBagId(result.data.id);
    }

    setIsSavingBag(false);

    if (result.error) {
      alert('Error saving bag: ' + result.error.message);
    } else {
      alert(isPublishing ? 'published to feed' : 'draft saved to your account');
      fetchFeedBags();
      fetchMyBags();
      if (isPublishing) setCurrentView('feed');
    }
  };

  const handleAddProductToCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand || !newName || !newImageUrl) return;

    setIsSubmitting(true);
    const { data, error } = await supabase
      .from('products')
      .insert([{ brand: newBrand.trim(), name: newName.trim(), shade: newShade.trim() || null, image_url: newImageUrl.trim() }])
      .select();

    setIsSubmitting(false);

    if (error) {
      alert('Could not save product.');
    } else if (data) {
      await fetchPublicCatalog();
      setNewBrand('');
      setNewName('');
      setNewShade('');
      setNewImageUrl('');
      setAddSuccessMsg(true);
      setTimeout(() => setAddSuccessMsg(false), 3000);
    }
  };

  const addTextAnnotation = () => {
    if (!fabricCanvas) return;
    const note = new Textbox('Double-click to type note...', {
      left: 160,
      top: 160,
      fontSize: 15,
      fontFamily: 'Beth Ellen',
      fontStyle: 'italic',
      fill: '#1239A0',
      width: 180,
    });
    fabricCanvas.add(note);
    fabricCanvas.setActiveObject(note);
    fabricCanvas.renderAll();
  };

  const filteredProducts = catalog.filter((p) =>
    `${p.brand} ${p.name} ${p.shade || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayUsername = username || 'account';

  return (
    <div style={{ minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* GLOBAL FONT & STYLING OVERRIDE */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Beth+Ellen&display=swap');
        *, body, button, input, textarea, h1, h2, h3, h4, h5, h6, span, p {
          font-family: 'Beth Ellen', cursive !important;
        }
      `}</style>
      
      {/* ALWAYS-VISIBLE TOP NAV BAR */}
      <nav style={{
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: currentView === 'feed' ? 'var(--bg-royal)' : '#FCFBF0',
        borderBottom: currentView === 'feed' ? 'none' : '1px solid var(--border-cream)'
      }}>
        <h1
          style={{ margin: 0, fontSize: '2.2rem', color: currentView === 'feed' ? '#FCFBF0' : 'var(--text-blue)', cursor: 'pointer' }}
          onClick={() => setCurrentView('home')}
        >
          unzipped
        </h1>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentView('feed')}
            style={{ background: 'none', border: 'none', color: currentView === 'feed' ? '#FCFBF0' : 'var(--text-blue)', cursor: 'pointer', fontStyle: 'italic' }}
          >
            feed ↗
          </button>
          
          {user ? (
            <>
              <button
                onClick={() => setCurrentView('my-bags')}
                style={{ background: 'none', border: 'none', color: currentView === 'feed' ? '#FCFBF0' : 'var(--text-blue)', cursor: 'pointer', fontWeight: 'bold' }}
              >
                @{displayUsername}
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid #ccc', background: 'transparent', color: currentView === 'feed' ? '#FCFBF0' : '#666', cursor: 'pointer', fontSize: '11px' }}
              >
                logout
              </button>
            </>
          ) : (
            <button
              onClick={() => { setIsSignUp(true); setShowAuthModal(true); }}
              style={{ padding: '8px 18px', borderRadius: '20px', backgroundColor: 'var(--text-blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              sign in / sign Up
            </button>
          )}
        </div>
      </nav>

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '16px', width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontStyle: 'italic', color: 'var(--text-blue)', marginBottom: '16px' }}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>

            {authError && <p style={{ color: 'red', fontSize: '12px', marginBottom: '10px' }}>{authError}</p>}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Username (e.g. urth1)"
                required
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
              <input
                type="email"
                placeholder="Email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
              <input
                type="password"
                placeholder="Password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
              />

              <button type="submit" style={{ padding: '12px', backgroundColor: 'var(--text-blue)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px' }}>
              <span style={{ color: '#666' }}>{isSignUp ? 'Already have an account? ' : "Don't have an account? "}</span>
              <span onClick={() => setIsSignUp(!isSignUp)} style={{ color: 'var(--text-blue)', textDecoration: 'underline', cursor: 'pointer' }}>
                {isSignUp ? 'Log In' : 'Sign Up'}
              </span>
            </div>
            <button onClick={() => setShowAuthModal(false)} style={{ marginTop: '12px', width: '100%', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '11px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* HOME PAGE */}
      {currentView === 'home' && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h1 style={{ fontSize: '6rem', marginBottom: '80px', color: 'var(--text-blue)' }}>unzipped</h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-blue)', marginBottom: '50px' }}>build your digital makeup bag today!</p>

          <form onSubmit={(e) => { e.preventDefault(); setCurrentBagId(null); setPendingLoadJson(null); setCurrentView('editor'); }} style={{ maxWidth: '380px', margin: '0 auto' }}>
            <input
              type="text"
              value={bagTitle}
              onChange={(e) => setBagTitle(e.target.value)}
              placeholder="enter the name of your makeup bag"
              style={{ width: '100%', padding: '12px 18px', borderRadius: '24px', border: '1px solid var(--text-blue)', fontSize: '1rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ marginTop: '16px', padding: '10px 24px', backgroundColor: 'var(--text-blue)', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontStyle: 'italic' }}>
              build now
            </button>
          </form>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'center', gap: '32px', fontSize: '14px' }}>
            <span style={{ cursor: 'pointer', fontStyle: 'italic', textDecoration: 'underline', color: 'var(--text-blue)' }} onClick={() => setCurrentView('add-product')}>
              + add product to shared catalog
            </span>
            <span style={{ cursor: 'pointer', fontStyle: 'italic', textDecoration: 'underline', color: 'var(--text-blue)' }} onClick={() => setCurrentView('feed')}>
              scroll through our feed
            </span>
            {!user && (
              <span style={{ cursor: 'pointer', fontStyle: 'italic', textDecoration: 'underline', color: 'var(--text-blue)', fontWeight: 'bold' }} onClick={() => { setIsSignUp(true); setShowAuthModal(true); }}>
                create an account
              </span>
            )}
          </div>
        </div>
      )}

      {/* FEED VIEW */}
      {currentView === 'feed' && (
        <div style={{ backgroundColor: 'var(--bg-royal)', minHeight: 'calc(100vh - 70px)', padding: '40px 24px', color: '#FCFBF0' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <h2 style={{ fontSize: '2.5rem', fontStyle: 'italic', margin: '0 0 4px 0' }}>unzipped</h2>
                <p style={{ fontSize: '1.2rem', margin: 0, fontStyle: 'italic', opacity: 0.9 }}>feed:</p>
              </div>
              <button
                onClick={() => { setBagTitle("enter the name of your makeup bag"); setCurrentBagId(null); setPendingLoadJson(null); setCurrentView('editor'); }}
                style={{ backgroundColor: '#FCFBF0', color: 'var(--text-blue)', border: 'none', padding: '10px 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                + build a new bag
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '32px' }}>
              {feedBags.map((bag, index) => {
                const isAdInsertPosition = (index + 1) % 3 === 0;
                const authorName = bag.profiles?.username || 'username';
                return (
                  <React.Fragment key={bag.id}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>

                      {/* USERNAME LINK ABOVE CARD */}
                      <span
                        onClick={() => openUserProfile(bag.user_id || '', authorName)}
                        style={{
                          fontStyle: 'italic',
                          fontSize: '1.2rem',
                          color: '#FCFBF0',
                          cursor: 'pointer',
                          marginBottom: '8px',
                          textDecoration: 'underline',
                          width: 'fit-content'
                        }}
                      >
                        @{authorName}
                      </span>

                      {/* BAG CARD - Clicking opens the up-close BagDetailModal */}
                      <div
                        onClick={() => setSelectedBag(bag)}
                        style={{
                          backgroundColor: 'var(--bg-cream)',
                          color: 'var(--text-blue)',
                          borderRadius: '24px',
                          padding: '24px',
                          cursor: 'pointer',
                          boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          minHeight: '180px',
                          textAlign: 'center'
                        }}
                      >
                        {bag.preview_image ? (
                          <div style={{ width: '100%', height: '180px', backgroundColor: '#FCFBF0', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={bag.preview_image} alt={bag.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <h3 style={{ margin: 0, fontStyle: 'italic', fontSize: '1.8rem', lineHeight: 1.2 }}>
                            {bag.title}
                          </h3>
                        )}
                      </div>
                    </div>

                    {isAdInsertPosition && (
                      <div
                        style={{
                          backgroundColor: '#1E293B',
                          border: '2px dashed #38BDF8',
                          borderRadius: '24px',
                          padding: '24px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          textAlign: 'center',
                          color: '#F8FAFC',
                        }}
                      >
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#38BDF8', marginBottom: '8px' }}>Sponsored</span>
                        <h4 style={{ fontStyle: 'italic', fontSize: '1.2rem', margin: '0 0 8px 0' }}>Glow Recipe Watermelon Niacinamide Dew Drops</h4>
                        <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '16px' }}>Highlighting serum for instant dewy radiance.</p>
                        <button onClick={() => window.open('https://www.sephora.com', '_blank')} style={{ backgroundColor: '#38BDF8', color: '#0F172A', border: 'none', padding: '8px 16px', borderRadius: '16px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                          Shop Now ↗
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* USER PROFILE / BAGS VIEW */}
      {currentView === 'profile' && (
        <div style={{ maxWidth: '900px', margin: '40px auto', padding: '0 24px' }}>
          <h2 style={{ fontStyle: 'italic', color: 'var(--text-blue)', fontSize: '2.2rem', marginBottom: '8px' }}>
            @{viewingUsername}'s Makeup Bags
          </h2>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '32px' }}>Explore published bags by this creator.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {profileBags.map((bag) => (
              <div
                key={bag.id}
                onClick={() => {
                  setBagTitle(bag.title);
                  setCurrentBagId(bag.id);
                  setPendingLoadJson(bag.canvas_json);
                  setCurrentView('editor');
                }}
                style={{ backgroundColor: '#fff', border: '1px solid var(--border-cream)', borderRadius: '16px', padding: '16px', cursor: 'pointer' }}
              >
                <div style={{ width: '100%', height: '180px', backgroundColor: '#FCFBF0', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                  {bag.preview_image && <img src={bag.preview_image} alt={bag.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                <h4 style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-blue)' }}>{bag.title}</h4>
              </div>
            ))}
          </div>
          <button onClick={() => setCurrentView('feed')} style={{ marginTop: '32px', background: 'none', border: 'none', color: 'var(--text-blue)', cursor: 'pointer', textDecoration: 'underline', fontStyle: 'italic' }}>
            ← Back to Feed
          </button>
        </div>
      )}

      {/* USER BAGS / ACCOUNT VIEW */}
      {currentView === 'my-bags' && (
        <div style={{ maxWidth: '900px', margin: '40px auto', padding: '0 24px' }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-cream)', marginBottom: '32px' }}>
            <h3 style={{ fontStyle: 'italic', color: 'var(--text-blue)', margin: '0 0 8px 0' }}>Update Username</h3>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>Change your profile display name across your bags and community posts.</p>
            {usernameUpdateMsg && <p style={{ fontSize: '12px', color: usernameUpdateMsg.includes('Error') ? 'red' : 'green', marginBottom: '10px' }}>{usernameUpdateMsg}</p>}
            <form onSubmit={handleUpdateUsername} style={{ display: 'flex', gap: '12px', maxWidth: '360px' }}>
              <input
                type="text"
                value={newUsernameInput}
                onChange={(e) => setNewUsernameInput(e.target.value)}
                placeholder="Enter correct username"
                required
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px' }}
              />
              <button type="submit" style={{ padding: '10px 18px', backgroundColor: 'var(--text-blue)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                Save
              </button>
            </form>
          </div>

          <h2 style={{ fontStyle: 'italic', color: 'var(--text-blue)' }}>
            @{displayUsername}'s Makeup Bags
          </h2>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '32px' }}>Manage your saved drafts and published community bags.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {myBags.map((bag) => (
              <div
                key={bag.id}
                onClick={() => {
                  setBagTitle(bag.title);
                  setCurrentBagId(bag.id);
                  setPendingLoadJson(bag.canvas_json);
                  setCurrentView('editor');
                }}
                style={{ backgroundColor: '#fff', border: '1px solid var(--border-cream)', borderRadius: '16px', padding: '16px', cursor: 'pointer' }}
              >
                <div style={{ width: '100%', height: '180px', backgroundColor: '#FCFBF0', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                  {bag.preview_image && <img src={bag.preview_image} alt={bag.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-blue)' }}>{bag.title}</h4>
                  <span style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '10px', backgroundColor: bag.is_published ? '#e6fcf5' : '#fff3bf', color: bag.is_published ? '#0ca678' : '#f59f00', fontWeight: 'bold' }}>
                    {bag.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CANVAS EDITOR VIEW */}
      {currentView === 'editor' && (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
          <header style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isEditingTitle ? (
              <input
                type="text"
                value={bagTitle}
                onChange={(e) => setBagTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                autoFocus
                style={{ fontSize: '1.4rem', color: 'var(--text-blue)', textAlign: 'center', border: 'none', borderBottom: '1px dashed var(--text-blue)', outline: 'none' }}
              />
            ) : (
              <h2 onClick={() => setIsEditingTitle(true)} style={{ fontSize: '1.4rem', color: 'var(--text-blue)', cursor: 'pointer' }}>
                {bagTitle} ✏️
              </h2>
            )}
          </header>

          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ border: '1px solid var(--border-cream)', borderRadius: '12px', overflow: 'hidden' }}>
                <canvas ref={canvasRef} />
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={addTextAnnotation} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid var(--text-blue)', color: 'var(--text-blue)', borderRadius: '16px', fontSize: '11px' }}>
                  + note box
                </button>

                <button onClick={() => handleSaveOrPublish(false)} disabled={isSavingBag} style={{ padding: '6px 14px', backgroundColor: '#e9ecef', color: '#495057', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 'bold', marginLeft: 'auto', cursor: 'pointer' }}>
                  {isSavingBag ? 'saving...' : 'save draft'}
                </button>

                <button onClick={() => handleSaveOrPublish(true)} disabled={isSavingBag} style={{ padding: '6px 14px', backgroundColor: '#0ca678', color: '#fff', border: 'none', borderRadius: '16px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                  {isSavingBag ? 'publishing...' : 'publish to feed'}
                </button>
              </div>
            </div>

            {/* Catalog Drawer with Quick Paste Image */}
            <div style={{ width: '260px', backgroundColor: 'var(--drawer-blue)', borderRadius: '12px', padding: '16px', color: '#fff', display: 'flex', flexDirection: 'column', height: '480px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <p style={{ fontSize: '12px', margin: 0 }}>search catalog:</p>
                <button
                  onClick={() => setCurrentView('add-product')}
                  style={{ background: 'none', border: 'none', color: '#FCFBF0', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}
                >
                  add new
                </button>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search product..."
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: 'none', fontSize: '12px', marginBottom: '10px', boxSizing: 'border-box' }}
              />

              <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                <p style={{ fontSize: '11px', margin: '0 0 4px 0' }}>paste image URL:</p>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={quickImageUrl}
                    onChange={(e) => setQuickImageUrl(e.target.value)}
                    style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', fontSize: '11px' }}
                  />
                  <button
                    onClick={() => {
                      if (quickImageUrl.trim()) {
                        addProductToCanvas(quickImageUrl.trim());
                        setQuickImageUrl('');
                      }
                    }}
                    style={{ padding: '6px 10px', backgroundColor: '#FCFBF0', color: 'var(--text-blue)', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    add
                  </button>
                </div>
              </div>

              {isProcessingBg && <p style={{ fontSize: '11px', color: '#fff3bf', fontStyle: 'italic', marginBottom: '8px' }}>Removing background...</p>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                {filteredProducts.map((prod) => (
                  <div key={prod.id} onClick={() => addProductToCanvas(prod.imageUrl)} style={{ backgroundColor: '#FCFBF0', color: 'var(--text-dark)', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <img src={prod.imageUrl} alt={prod.name} style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ fontSize: '11px', overflow: 'hidden' }}>
                      <strong>{prod.brand}</strong> - {prod.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD CATALOG PRODUCT VIEW */}
      {currentView === 'add-product' && (
        <div style={{ padding: '40px 24px', maxWidth: '750px', margin: '0 auto' }}>
          <h2 style={{ color: 'var(--text-blue)', fontSize: '2.2rem', whiteSpace: 'nowrap' }}>add a product to the public catalogue</h2>
          {addSuccessMsg && <p style={{ color: 'green', fontSize: '12px' }}>✓ Saved to public catalog!</p>}
          <form onSubmit={handleAddProductToCatalog} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <input
              type="text"
              placeholder="brand (e.g. Visee)"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              required
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <input
              type="text"
              placeholder="product name (e.g. Essence Lip Plumper)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <input
              type="text"
              placeholder="shade (optional)"
              value={newShade}
              onChange={(e) => setNewShade(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <input
              type="url"
              placeholder="image URL"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              required
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '12px', backgroundColor: 'var(--text-blue)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isSubmitting ? 'adding...' : 'add to the catalogue'}
            </button>
          </form>
          <button
            onClick={() => setCurrentView('home')}
            style={{ marginTop: '16px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
          >
            ← back to home
          </button>
        </div>
      )}

      {/* UP-CLOSE BAG DETAIL MODAL (LIKES & COMMENTS) */}
      <BagDetailModal
        bag={selectedBag}
        onClose={() => setSelectedBag(null)}
        currentUserId={user?.email || 'Anonymous Creator'}
      />
    </div>
  );
}