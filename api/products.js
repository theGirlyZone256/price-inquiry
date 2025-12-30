const Airtable = require('airtable');

// Initialize Airtable
let base;
try {
  base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
  }).base(process.env.AIRTABLE_BASE_ID);
} catch (error) {
  console.error('Airtable init error:', error);
}

// Main handler
module.exports = async (req, res) => {
  console.log(`🌐 ${req.method} ${req.url}`);
  
  // ========== CORS HEADERS - MUST BE FIRST ==========
  // Allow your Netlify domain
  res.setHeader('Access-Control-Allow-Origin', 'https://priceinquiry.netlify.app');
  // Also allow localhost for testing
  if (req.headers.origin && req.headers.origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // ========== HANDLE OPTIONS PREFLIGHT ==========
  if (req.method === 'OPTIONS') {
    console.log('🛬 OPTIONS preflight handled');
    return res.status(200).end();
  }
  // ===============================================
  
  // For debugging
  if (req.method === 'GET' && req.url === '/api/products') {
    return res.json({ 
      success: true, 
      message: 'API is working!',
      timestamp: new Date().toISOString()
    });
  }
  
  // CREATE PROJECT
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      console.log('📦 Creating project...');
      
      // Parse body
      let body;
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        body = req.body;
      }
      
      console.log('Body received:', body);
      
      const { imageUrls, projectName } = body || {};
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URLs array required' 
        });
      }
      
      // Create project in Airtable
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);
      
      // Create product records
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      // Batch create
      for (let i = 0; i < productRecords.length; i += 10) {
        await base('products').create(productRecords.slice(i, i + 10));
      }
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
      
    } catch (error) {
      console.error('❌ Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Unknown error' 
      });
    }
  }
  
  // Default response
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    path: req.url,
    method: req.method 
  });
};

// Handle Vercel serverless function requirements
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb'
    }
  }
};