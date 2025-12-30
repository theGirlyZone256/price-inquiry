const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // === CORS HEADERS FOR ALL REQUESTS ===
  res.setHeader('Access-Control-Allow-Origin', 'https://priceinquiry.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // === HANDLE ALL OPTIONS REQUESTS ===
  if (req.method === 'OPTIONS') {
    console.log('🛬 Handling OPTIONS preflight for', req.url);
    return res.status(200).end();
  }
  
  console.log(`📡 ${req.method} ${req.url}`);
  
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
  
  // GET PROJECT WITH PRODUCTS
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
      
      // Get ALL products and filter manually
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
      
      // Sort by item number
      linkedProducts.sort((a, b) => {
        const aNum = parseInt(a.id.split('_item')[1]) || 0;
        const bNum = parseInt(b.id.split('_item')[1]) || 0;
        return aNum - bNum;
      });
      
      console.log(`✅ Found ${linkedProducts.length} products for ${projectId}`);
      
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
  
  // SUBMIT INQUIRY
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      console.log('📝 Received inquiry submission:', req.body);
      const { productId, price, colors, notes } = req.body;
      
      if (!productId || !price) {
        return res.status(400).json({ 
          success: false, 
          error: 'Product ID and Price are required' 
        });
      }
      
      const priceNum = Number(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Price must be a positive number' 
        });
      }
      
      console.log(`💸 Creating inquiry for ${productId}: UGX ${priceNum}`);
      
      // Create the inquiry record
      const inquiryRecord = await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: priceNum,
          colors: colors || '', 
          notes: notes || '',
          submittedAt: new Date().toISOString()
        } 
      }]);
      
      console.log(`✅ Inquiry saved successfully! ID: ${inquiryRecord[0].id}`);
      
      return res.json({ 
        success: true, 
        message: 'Price submitted successfully!',
        inquiryId: inquiryRecord[0].id
      });
      
    } catch (error) {
      console.error('❌ Error submitting inquiry:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to submit inquiry' 
      });
    }
  }
  
  // Default 404
  console.log(`❌ Route not found: ${req.method} ${req.url}`);
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
};