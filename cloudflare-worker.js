export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith('/upload')) {
        return await handleUpload(request, env, corsHeaders);
      } else if (path.startsWith('/download/')) {
        return await handleDownload(request, env, corsHeaders);
      } else if (path.startsWith('/delete/')) {
        return await handleDelete(request, env, corsHeaders);
      } else if (path.startsWith('/list')) {
        return await handleList(request, env, corsHeaders);
      } else {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

async function handleUpload(request, env, corsHeaders) {
  const formData = await request.formData();
  const file = formData.get('file');
  const fileName = formData.get('fileName') || file.name;

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${Date.now()}_${cleanFileName}`;

  await env.BUCKET.put(uniqueFileName, file);

  const publicUrl = `${request.url.split('/upload')[0]}/download/${uniqueFileName}`;

  return new Response(JSON.stringify({
    success: true,
    url: publicUrl,
    fileName: cleanFileName,
    size: file.size,
    type: file.type
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleDownload(request, env, corsHeaders) {
  const url = new URL(request.url);
  const fileName = url.pathname.split('/download/')[1];

  const object = await env.BUCKET.get(fileName);

  if (!object) {
    return new Response('File not found', {
      status: 404,
      headers: corsHeaders
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, {
    headers: Object.assign({}, corsHeaders, headers)
  });
}

async function handleDelete(request, env, corsHeaders) {
  const url = new URL(request.url);
  const fileName = url.pathname.split('/delete/')[1];

  await env.BUCKET.delete(fileName);

  return new Response(JSON.stringify({
    success: true,
    fileName
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleList(request, env, corsHeaders) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';

  const listed = await env.BUCKET.list({ prefix });

  return new Response(JSON.stringify({
    success: true,
    files: listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded
    }))
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
