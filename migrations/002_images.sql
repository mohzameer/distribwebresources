-- Images are an optional enhancement, never the layout's backbone: an audit showed 68% of
-- items carry one, but 19 feeds never do -- including most of the best distributed-systems
-- writers (Werner Vogels, Aphyr, Dan Luu, Kleppmann) and the whole of arXiv and Lobsters.
-- Every layout must therefore read well with this column null.
alter table items add column if not exists image_url text;
