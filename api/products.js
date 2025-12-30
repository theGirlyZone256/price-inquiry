const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // === CORS HEADERS ===
  // Fix: Use the actual frontend URL from your error message
  const allowedOrigins = [
    'https://priceinquiry.netlify.app',
    'https://your-new-netlify-url.netlify.app'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all for development, restrict in production
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
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
      
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString().split('T')[0]
        }
      }]);
      
      const projectAirtableId = projectRecord[0].id;
      
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectAirtableId]
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
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // GET PROJECT WITH PRODUCTS
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      
      const projectRecords = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();
      
      if (projectRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id;
      
      const allProducts = await base('products').select().all();
      const linkedProducts = [];
      
      allProducts.forEach(record => {
        if (record.fields.project && 
            Array.isArray(record.fields.project) && 
            record.fields.project.includes(projectAirtableId)) {
          linkedProducts.push({
            id: record.fields.id,
            imageUrl: record.fields.imageUrl
          });
        }
      });
      
      return res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          status: project.Status || 'Todo',
          createdAt: project.createdAt
        },
        products: linkedProducts
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
};