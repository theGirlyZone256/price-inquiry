const Airtable = require('airtable');

module.exports = async (req, res) => {
  // === CORS HEADERS ===
  res.setHeader('Access-Control-Allow-Origin', 'https://priceinquiry.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // === HANDLE OPTIONS ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Initialize Airtable
  const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
  }).base(process.env.AIRTABLE_BASE_ID);
  
  // CREATE PROJECT
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URLs array required' 
        });
      }
      
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      
      // Create project with PROPER date format
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString().split('T')[0] // FIX: Use YYYY-MM-DD format
        }
      }]);
      
      // Create products
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
};