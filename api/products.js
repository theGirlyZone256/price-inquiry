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
  
  console.log(`📡 ${req.method} ${req.url}`, req.query);
  
  // Initialize Airtable
  const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
  }).base(process.env.AIRTABLE_BASE_ID);
  
  // CREATE PROJECT (POST to /api/products)
  if (req.method === 'POST') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URLs array required' 
        });
      }
      
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      console.log(`🆕 Creating project: ${projectId} with ${imageUrls.length} images`);
      
      // Create project
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString().split('T')[0]
        }
      }]);
      
      const projectAirtableId = projectRecord[0].id;
      console.log(`✅ Project created. Airtable ID: ${projectAirtableId}`);
      
      // Create products
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectAirtableId]
        }
      }));
      
      console.log(`📸 Creating ${productRecords.length} product records...`);
      await base('products').create(productRecords);
      console.log(`✅ Products created successfully`);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
      
    } catch (error) {
      console.error('❌ Error creating project:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // GET PROJECT WITH PRODUCTS (GET with project query parameter)
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      console.log(`🔍 Looking for project: ${projectId}`);
      
      // Find project
      const projectRecords = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();
      
      if (projectRecords.length === 0) {
        console.log(`❌ Project not found: ${projectId}`);
        return res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id;
      console.log(`✅ Project found. Airtable ID: ${projectAirtableId}`);
      
      // Find products for this project
      const productRecords = await base('products').select({
        filterByFormula: `{project} = '${projectAirtableId}'`
      }).firstPage();
      
      console.log(`📊 Found ${productRecords.length} products linked to project`);
      
      const linkedProducts = productRecords.map(record => ({
        id: record.fields.id,
        imageUrl: record.fields.imageUrl
      }));
      
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
      console.error('❌ Error fetching project:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // SIMPLE DEBUG - check if function is working
  if (req.method === 'GET') {
    return res.json({
      success: true,
      message: 'API is working',
      endpoint: '/api/products',
      query: req.query,
      projectParam: req.query.project
    });
  }
  
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
};